// Job Scheduler with BullMQ
// Flexible scheduling based on Kyiv time with per-city tracking

import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { runApartmentFetcher } from './apartmentFetcher.js';
import { sendNotifications } from './notificationSender.js';
import { logger } from '../lib/logger.js';
import * as metrics from '../lib/metrics.js';

// Queue names
const FETCH_QUEUE_NAME = 'apartment-fetch';
const API_STATS_KEY = 'api:stats';
const CITY_TIMESTAMPS_KEY = 'city:timestamps';

// BullMQ Queue
let fetchQueue: Queue | null = null;
let fetchWorker: Worker | null = null;

// Kyiv timezone offset (UTC+2 or UTC+3 during DST)
function getKyivHour(): number {
  const now = new Date();
  // Use Intl API to get accurate Kyiv time
  const kyivTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return parseInt(kyivTime, 10);
}

// Calculate delay until next fetch based on Kyiv time
function getNextFetchDelayMs(): number {
  const hour = getKyivHour();

  // Night: 23:00 - 07:00 - NO FETCH, wait until 7am
  if (hour >= 23 || hour < 7) {
    // Calculate ms until 7am Kyiv time
    const now = new Date();
    const kyivFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Get target time (7am tomorrow if past 23:00, today if before 7:00)
    let targetDate = new Date(now);
    if (hour >= 23) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    // Set to 7am in Kyiv (approximate by adding 7 hours to midnight)
    const currentKyivParts = kyivFormatter.formatToParts(now);
    const currentMinute = parseInt(currentKyivParts.find(p => p.type === 'minute')?.value || '0');

    // Simple calculation: hours until 7am + remaining minutes
    const hoursUntil7 = hour >= 23
      ? (24 - hour + 7)
      : (7 - hour);
    const msUntil7 = hoursUntil7 * 60 * 60 * 1000 - currentMinute * 60 * 1000;

    const delayMinutes = Math.round(msUntil7 / 1000 / 60);
    logger.scheduler.cronScheduled(msUntil7, hour);
    metrics.cronNextRunDelay.set(msUntil7 / 1000);
    metrics.cronKyivHour.set(hour);
    return msUntil7;
  }

  // Morning: 07:00 - 09:00 - 1 hour interval
  if (hour >= 7 && hour < 9) {
    const delay = 60 * 60 * 1000;
    logger.scheduler.cronScheduled(delay, hour);
    metrics.cronNextRunDelay.set(delay / 1000);
    metrics.cronKyivHour.set(hour);
    return delay;
  }

  // Peak hours: 09:00 - 19:00 - 30 min interval
  if (hour >= 9 && hour < 19) {
    const delay = 30 * 60 * 1000;
    logger.scheduler.cronScheduled(delay, hour);
    metrics.cronNextRunDelay.set(delay / 1000);
    metrics.cronKyivHour.set(hour);
    return delay;
  }

  // Evening: 19:00 - 23:00 - 1 hour interval
  const delay = 60 * 60 * 1000;
  logger.scheduler.cronScheduled(delay, hour);
  metrics.cronNextRunDelay.set(delay / 1000);
  metrics.cronKyivHour.set(hour);
  return delay;
}

// Check if we should skip fetching (night time)
function shouldSkipFetch(): boolean {
  const hour = getKyivHour();
  return hour >= 23 || hour < 7;
}

// Get last fetch timestamp for a city
export async function getCityLastFetch(city: string): Promise<Date | null> {
  const timestamp = await redis.hget(CITY_TIMESTAMPS_KEY, city);
  return timestamp ? new Date(parseInt(timestamp, 10)) : null;
}

// Set last fetch timestamp for a city
export async function setCityLastFetch(city: string, date: Date = new Date()): Promise<void> {
  await redis.hset(CITY_TIMESTAMPS_KEY, city, date.getTime().toString());
}

// Get all city timestamps
export async function getAllCityTimestamps(): Promise<Record<string, Date>> {
  const timestamps = await redis.hgetall(CITY_TIMESTAMPS_KEY);
  const result: Record<string, Date> = {};
  for (const [city, ts] of Object.entries(timestamps)) {
    result[city] = new Date(parseInt(ts, 10));
  }
  return result;
}

// API Stats tracking
export interface ApiStats {
  totalRequests: number;
  searchRequests: number;
  detailRequests: number;
  lastReset: Date;
  dailyRequests: number;
}

export async function getApiStats(): Promise<ApiStats> {
  const stats = await redis.hgetall(API_STATS_KEY);
  return {
    totalRequests: parseInt(stats.totalRequests || '0', 10),
    searchRequests: parseInt(stats.searchRequests || '0', 10),
    detailRequests: parseInt(stats.detailRequests || '0', 10),
    lastReset: stats.lastReset ? new Date(parseInt(stats.lastReset, 10)) : new Date(),
    dailyRequests: parseInt(stats.dailyRequests || '0', 10),
  };
}

export async function incrementApiStats(type: 'search' | 'detail', count: number = 1): Promise<void> {
  await redis.hincrby(API_STATS_KEY, 'totalRequests', count);
  await redis.hincrby(API_STATS_KEY, 'dailyRequests', count);

  if (type === 'search') {
    await redis.hincrby(API_STATS_KEY, 'searchRequests', count);
  } else {
    await redis.hincrby(API_STATS_KEY, 'detailRequests', count);
  }
}

export async function resetDailyStats(): Promise<void> {
  await redis.hset(API_STATS_KEY, 'dailyRequests', '0');
  await redis.hset(API_STATS_KEY, 'lastReset', Date.now().toString());
}

// Job result interface
export interface FetchJobResult {
  newApartments: number;
  notificationsSent: number;
  notificationsFailed: number;
  skipped: boolean;
  skipReason?: string;
}

// Run the full fetch and notify cycle
// force=true bypasses night time check (for manual triggers)
export async function runFetchCycle(force: boolean = false): Promise<FetchJobResult> {
  const startTime = Date.now();
  const kyivHour = getKyivHour();

  const jobContext = {
    jobName: 'fetch_cycle',
    forced: force,
    kyivHour,
  };

  // Check if we should skip (night time) - unless forced
  if (!force && shouldSkipFetch()) {
    const skipReason = `Night time (${kyivHour}:00 Kyiv)`;

    logger.scheduler.cronJobSkipped(jobContext, skipReason);
    metrics.cronJobRuns.inc({ job_name: 'fetch_cycle', status: 'skipped', forced: String(force) });

    return {
      newApartments: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      skipped: true,
      skipReason,
    };
  }

  // Log job start with full params
  logger.scheduler.cronJobStarted(jobContext, {
    kyivHour,
    forced: force,
    skipNightCheck: force,
  });
  metrics.cronJobRuns.inc({ job_name: 'fetch_cycle', status: 'started', forced: String(force) });

  try {
    // Step 1: Fetch new apartments
    const { totalNew, matchedApartments } = await runApartmentFetcher();

    // Step 2: Send notifications for matched apartments
    let notificationsSent = 0;
    let notificationsFailed = 0;

    if (matchedApartments.size > 0) {
      const result = await sendNotifications(matchedApartments);
      notificationsSent = result.sent;
      notificationsFailed = result.failed;
    }

    const duration = Date.now() - startTime;

    // Log job completion with full results
    logger.scheduler.cronJobCompleted(jobContext, {
      newApartments: totalNew,
      matchedCount: matchedApartments.size,
      notificationsSent,
      notificationsFailed,
    }, duration);

    // Track metrics
    metrics.cronJobRuns.inc({ job_name: 'fetch_cycle', status: 'completed', forced: String(force) });
    metrics.cronJobDuration.observe({ job_name: 'fetch_cycle' }, duration / 1000);
    metrics.fetchCycleDuration.observe(duration / 1000);

    return {
      newApartments: totalNew,
      notificationsSent,
      notificationsFailed,
      skipped: false,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.scheduler.cronJobFailed(jobContext, error as Error);
    metrics.cronJobRuns.inc({ job_name: 'fetch_cycle', status: 'failed', forced: String(force) });
    metrics.errors.inc({ type: 'cron_error', component: 'scheduler' });

    return {
      newApartments: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      skipped: false,
    };
  }
}

// Process fetch job
async function processFetchJob(job: Job): Promise<FetchJobResult> {
  const force = job.data?.force === true;

  logger.scheduler.info('queue.job_processing', `Processing job ${job.id}`, {
    job: {
      jobId: job.id,
      jobName: 'fetch',
      forced: force,
    },
  });

  const result = await runFetchCycle(force);

  // Schedule next job after this one completes
  if (fetchQueue) {
    const delay = getNextFetchDelayMs();
    await fetchQueue.add('fetch', {}, { delay });

    logger.scheduler.info('queue.next_job_scheduled', `Next job scheduled in ${Math.round(delay / 1000 / 60)} minutes`, {
      job: {
        delay,
        kyivHour: getKyivHour(),
      },
    });
  }

  return result;
}

// Start the scheduler with BullMQ
export async function startScheduler(): Promise<void> {
  if (fetchQueue) {
    logger.scheduler.info('scheduler.already_running', 'Scheduler already running');
    return;
  }

  logger.scheduler.info('scheduler.starting', 'Starting BullMQ scheduler...', {
    kyivHour: getKyivHour(),
  });

  // Create queue
  fetchQueue = new Queue(FETCH_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50,      // Keep last 50 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    },
  });

  // Create worker
  fetchWorker = new Worker(
    FETCH_QUEUE_NAME,
    processFetchJob,
    {
      connection: redis,
      concurrency: 1, // Only one job at a time
    }
  );

  // Worker event handlers
  fetchWorker.on('completed', (job, result) => {
    logger.scheduler.info('queue.job_completed', `Job ${job.id} completed`, {
      job: {
        jobId: job.id,
        jobName: 'fetch',
      },
      result: {
        newApartments: result.newApartments,
        notificationsSent: result.notificationsSent,
        notificationsFailed: result.notificationsFailed,
        skipped: result.skipped,
        skipReason: result.skipReason,
      },
    });

    // Update queue metrics
    updateQueueMetrics();
  });

  fetchWorker.on('failed', (job, err) => {
    logger.scheduler.error('queue.job_failed', `Job ${job?.id} failed: ${err.message}`, {
      job: {
        jobId: job?.id,
        jobName: 'fetch',
      },
      error: {
        error: err.message,
        stack: err.stack,
      },
    });

    metrics.errors.inc({ type: 'queue_error', component: 'scheduler' });
    updateQueueMetrics();
  });

  // Clean up ALL old jobs (drain only removes waiting, not delayed)
  await fetchQueue.obliterate({ force: true });

  // Check if we should run now or wait
  const kyivHour = getKyivHour();
  if (shouldSkipFetch()) {
    // Night time - schedule for 7am
    const delay = getNextFetchDelayMs();
    await fetchQueue.add('fetch', {}, { delay });

    logger.scheduler.info('scheduler.started', 'Scheduler started - night time, first job scheduled', {
      kyivHour,
      firstJobDelay: delay,
      firstJobDelayMinutes: Math.round(delay / 1000 / 60),
    });
  } else {
    // Day time - run immediately
    await fetchQueue.add('fetch', {});

    logger.scheduler.info('scheduler.started', 'Scheduler started - day time, first job added', {
      kyivHour,
      firstJobDelay: 0,
    });
  }

  // Initial queue metrics update
  updateQueueMetrics();
}

// Helper to update queue metrics for Prometheus
async function updateQueueMetrics(): Promise<void> {
  if (!fetchQueue) return;

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      fetchQueue.getWaitingCount(),
      fetchQueue.getActiveCount(),
      fetchQueue.getCompletedCount(),
      fetchQueue.getFailedCount(),
      fetchQueue.getDelayedCount(),
    ]);

    metrics.queueJobs.set({ status: 'waiting' }, waiting);
    metrics.queueJobs.set({ status: 'active' }, active);
    metrics.queueJobs.set({ status: 'completed' }, completed);
    metrics.queueJobs.set({ status: 'failed' }, failed);
    metrics.queueJobs.set({ status: 'delayed' }, delayed);
  } catch {
    // Ignore errors updating metrics
  }
}

// Manual trigger (for admin command) - always forces execution
export async function triggerManualFetch(): Promise<FetchJobResult | null> {
  if (!fetchQueue) {
    logger.scheduler.warn('manual_fetch.queue_not_initialized', 'Queue not initialized for manual trigger');
    return null;
  }

  logger.scheduler.info('manual_fetch.triggered', 'Manual fetch triggered (forced)', {
    kyivHour: getKyivHour(),
  });

  // Run immediately without scheduling, bypassing night time check
  const result = await runFetchCycle(true);
  return result;
}

// Stop the scheduler
export async function stopScheduler(): Promise<void> {
  if (fetchWorker) {
    await fetchWorker.close();
    fetchWorker = null;
  }
  if (fetchQueue) {
    await fetchQueue.close();
    fetchQueue = null;
  }
  logger.scheduler.info('scheduler.stopped', 'Scheduler stopped');
}

// Check if scheduler is running
export function isSchedulerRunning(): boolean {
  return fetchQueue !== null && fetchWorker !== null;
}

// Get queue stats for monitoring
export async function getQueueStats() {
  if (!fetchQueue) {
    return null;
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    fetchQueue.getWaitingCount(),
    fetchQueue.getActiveCount(),
    fetchQueue.getCompletedCount(),
    fetchQueue.getFailedCount(),
    fetchQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    kyivHour: getKyivHour(),
    nextFetchIn: `${(getNextFetchDelayMs() / 1000 / 60).toFixed(0)} min`,
  };
}

// Export queue for Bull Board
export function getFetchQueue(): Queue | null {
  return fetchQueue;
}
