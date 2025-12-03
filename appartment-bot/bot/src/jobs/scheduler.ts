// Job Scheduler with BullMQ
// Parallel city processing with coordination and rate-limited notifications

import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../lib/redis.js';
import { groupSearches, fetchGroupApartments, SearchGroup } from './apartmentFetcher.js';
import { logger } from '../lib/logger.js';
import * as metrics from '../lib/metrics.js';
import { v4 as uuidv4 } from 'uuid';

// Queue names
const FETCH_QUEUE_NAME = 'apartment-fetch';
const NOTIFICATION_QUEUE_NAME = 'notifications';
const API_STATS_KEY = 'api:stats';
const CITY_TIMESTAMPS_KEY = 'city:timestamps';

// Configuration
const FETCH_CONCURRENCY = parseInt(process.env.FETCH_CONCURRENCY || '5', 10);
const CYCLE_TTL_SECONDS = 1800; // 30 minutes TTL for cycle data

// BullMQ Queues
let fetchQueue: Queue | null = null;
let notificationQueue: Queue | null = null;
let fetchWorker: Worker | null = null;
let notificationWorker: Worker | null = null;

// Job types
type FetchJobType = 'cycle-start' | 'city-fetch' | 'cycle-complete';

interface CycleStartJobData {
  type: 'cycle-start';
  force?: boolean;
}

// Serialized version of SearchGroup for BullMQ (BigInt converted to string)
interface SerializedSearchGroup {
  city: string;
  propertyType: 'rent' | 'buy';
  apartmentType: 'flat' | 'house';
  searches: {
    id: string;
    userId: string; // Serialized from bigint
    priceMin: number | null;
    priceMax: number | null;
    rooms: number[];
    areaMin: number | null;
    areaMax: number | null;
    floorMin: number | null;
    floorMax: number | null;
    withoutRealtors: boolean;
    petsFriendly: boolean;
    notifyEnabled: boolean;
  }[];
}

interface CityFetchJobData {
  type: 'city-fetch';
  cycleId: string;
  groupKey: string;
  group: SerializedSearchGroup;
}

interface CycleCompleteJobData {
  type: 'cycle-complete';
  cycleId: string;
}

type FetchJobData = CycleStartJobData | CityFetchJobData | CycleCompleteJobData;

// Notification job data
export interface NotificationJobData {
  odaId: string;
  chatId: string;
  apartmentId: string;
  searchIds: string[];
  apartment: {
    id: string;
    title: string;
    city: string;
    district: string | null;
    address: string | null;
    price: number;
    currency: string;
    rooms: number | null;
    area: number | null;
    floor: number | null;
    totalFloors: number | null;
    isFromRealtor: boolean;
    agencyName: string | null;
    commission: string | null;
    petsFriendly: boolean;
    publishedAt: Date | null;
    url: string;
    photos: string[];
  };
}

// Kyiv timezone offset (UTC+2 or UTC+3 during DST)
function getKyivHour(): number {
  const now = new Date();
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

    const currentKyivParts = kyivFormatter.formatToParts(now);
    const currentMinute = parseInt(currentKyivParts.find(p => p.type === 'minute')?.value || '0');

    const hoursUntil7 = hour >= 23 ? (24 - hour + 7) : (7 - hour);
    const msUntil7 = hoursUntil7 * 60 * 60 * 1000 - currentMinute * 60 * 1000;

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

// Per-city stats
export interface CityStats {
  found: number;
  storedToDb: number;
  matched: number;
  notificationsSent: number;
}

// Job result interface
export interface FetchJobResult {
  newApartments: number;
  notificationsQueued: number;
  skipped: boolean;
  skipReason?: string;
  cityStats: Record<string, CityStats>;
}

// Redis keys for cycle coordination
function getCycleKeys(cycleId: string) {
  return {
    groups: `cycle:${cycleId}:groups`,
    completed: `cycle:${cycleId}:completed`,
    results: (groupKey: string) => `cycle:${cycleId}:results:${groupKey}`,
    startTime: `cycle:${cycleId}:startTime`,
    cityStats: `cycle:${cycleId}:cityStats`,
  };
}

// Process cycle-start job: creates city jobs
async function processCycleStart(job: Job<CycleStartJobData>): Promise<void> {
  const force = job.data.force === true;
  const kyivHour = getKyivHour();

  // Check if we should skip (night time) - unless forced
  if (!force && shouldSkipFetch()) {
    const skipReason = `Night time (${kyivHour}:00 Kyiv)`;
    logger.scheduler.cronJobSkipped({ jobName: 'cycle-start', forced: force, kyivHour }, skipReason);
    metrics.cronJobRuns.inc({ job_name: 'cycle-start', status: 'skipped', forced: String(force) });

    // Schedule next cycle
    const delay = getNextFetchDelayMs();
    await fetchQueue?.add('cycle-start', { type: 'cycle-start' } as CycleStartJobData, { delay });
    return;
  }

  const cycleId = uuidv4();
  const keys = getCycleKeys(cycleId);

  logger.scheduler.info('cycle.started', `Starting fetch cycle ${cycleId}`, {
    cycleId,
    kyivHour,
    forced: force,
    concurrency: FETCH_CONCURRENCY,
  });

  metrics.cronJobRuns.inc({ job_name: 'cycle-start', status: 'started', forced: String(force) });

  // Get all search groups
  const groups = await groupSearches();

  if (groups.length === 0) {
    logger.scheduler.info('cycle.no_groups', 'No active searches found', { cycleId });

    // Schedule next cycle
    const delay = getNextFetchDelayMs();
    await fetchQueue?.add('cycle-start', { type: 'cycle-start' } as CycleStartJobData, { delay });
    return;
  }

  // Store cycle metadata in Redis
  const groupKeys = groups.map(g => `${g.city}-${g.propertyType}-${g.apartmentType}`);
  await redis.setex(keys.groups, CYCLE_TTL_SECONDS, JSON.stringify(groupKeys));
  await redis.setex(keys.startTime, CYCLE_TTL_SECONDS, Date.now().toString());

  logger.scheduler.info('cycle.groups_created', `Creating ${groups.length} city jobs`, {
    cycleId,
    groupCount: groups.length,
    groupKeys,
  });

  // Create a city-fetch job for each group
  for (const group of groups) {
    const groupKey = `${group.city}-${group.propertyType}-${group.apartmentType}`;

    // Serialize group to handle BigInt (userId) - JSON.stringify can't handle BigInt
    const serializedGroup = {
      ...group,
      searches: group.searches.map(s => ({
        ...s,
        userId: s.userId.toString(),
      })),
    };

    await fetchQueue?.add(
      'city-fetch',
      {
        type: 'city-fetch',
        cycleId,
        groupKey,
        group: serializedGroup,
      } as CityFetchJobData,
      {
        jobId: `${cycleId}-${groupKey}`,
      }
    );
  }

  logger.scheduler.info('cycle.jobs_queued', `Queued ${groups.length} city fetch jobs`, {
    cycleId,
    groupCount: groups.length,
  });
}

// Process city-fetch job: fetches apartments for one city
async function processCityFetch(job: Job<CityFetchJobData>): Promise<void> {
  const { cycleId, groupKey, group: serializedGroup } = job.data;
  const keys = getCycleKeys(cycleId);
  const startTime = Date.now();

  // Deserialize group: convert userId back from string to bigint
  const group: SearchGroup = {
    ...serializedGroup,
    searches: serializedGroup.searches.map(s => ({
      ...s,
      userId: BigInt(s.userId),
    })),
  };

  logger.scheduler.info('city.fetch_started', `Fetching ${groupKey}`, {
    cycleId,
    groupKey,
    city: group.city,
    searchCount: group.searches.length,
  });

  try {
    // Fetch apartments for this group
    const { newApartments, matchedSearches, apiFound } = await fetchGroupApartments(group);

    // Store results in Redis
    const result = {
      apiFound,
      storedToDb: newApartments.length,
      matched: matchedSearches.size,
      matchedApartments: Array.from(matchedSearches.entries()),
    };

    await redis.setex(keys.results(groupKey), CYCLE_TTL_SECONDS, JSON.stringify(result));

    // Update city last fetch timestamp
    await setCityLastFetch(group.city);

    const duration = Date.now() - startTime;

    logger.scheduler.info('city.fetch_completed', `Completed ${groupKey}`, {
      cycleId,
      groupKey,
      apiFound,
      storedToDb: newApartments.length,
      matched: matchedSearches.size,
      duration,
    });

    metrics.fetchGroupDuration.observe({ city: group.city, property_type: group.propertyType }, duration / 1000);

  } catch (error) {
    logger.scheduler.error('city.fetch_failed', `Failed ${groupKey}: ${(error as Error).message}`, {
      cycleId,
      groupKey,
      error: {
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    });

    // Store empty result on error
    await redis.setex(keys.results(groupKey), CYCLE_TTL_SECONDS, JSON.stringify({
      apiFound: 0,
      storedToDb: 0,
      matched: 0,
      matchedApartments: [],
      error: (error as Error).message,
    }));

    metrics.errors.inc({ type: 'city_fetch_error', component: 'scheduler' });
  }

  // Mark as completed
  await redis.sadd(keys.completed, groupKey);

  // Check if all groups are done
  const [completedCount, totalGroupsJson] = await Promise.all([
    redis.scard(keys.completed),
    redis.get(keys.groups),
  ]);

  const totalGroups = totalGroupsJson ? JSON.parse(totalGroupsJson).length : 0;

  logger.scheduler.info('city.progress', `Progress: ${completedCount}/${totalGroups}`, {
    cycleId,
    completedCount,
    totalGroups,
  });

  // If all groups are done, trigger cycle-complete
  if (completedCount >= totalGroups) {
    logger.scheduler.info('cycle.all_cities_done', `All cities completed, triggering cycle-complete`, {
      cycleId,
      completedCount,
    });

    await fetchQueue?.add(
      'cycle-complete',
      { type: 'cycle-complete', cycleId } as CycleCompleteJobData,
      { jobId: `${cycleId}-complete` }
    );
  }
}

// Process cycle-complete job: aggregates results and queues notifications
async function processCycleComplete(job: Job<CycleCompleteJobData>): Promise<FetchJobResult> {
  const { cycleId } = job.data;
  const keys = getCycleKeys(cycleId);

  const startTimeStr = await redis.get(keys.startTime);
  const cycleStartTime = startTimeStr ? parseInt(startTimeStr, 10) : Date.now();
  const cycleDuration = Date.now() - cycleStartTime;

  logger.scheduler.info('cycle.completing', `Aggregating results for cycle ${cycleId}`, {
    cycleId,
    cycleDuration,
  });

  // Get all group keys
  const groupKeysJson = await redis.get(keys.groups);
  const groupKeys: string[] = groupKeysJson ? JSON.parse(groupKeysJson) : [];

  // Collect all results
  const allMatchedApartments = new Map<string, string[]>();
  const cityStats: Record<string, CityStats> = {};
  let totalNew = 0;

  for (const groupKey of groupKeys) {
    const resultJson = await redis.get(keys.results(groupKey));
    if (!resultJson) continue;

    const result = JSON.parse(resultJson);
    const city = groupKey.split('-')[0] || 'unknown';

    // Initialize city stats if needed
    if (!cityStats[city]) {
      cityStats[city] = { found: 0, storedToDb: 0, matched: 0, notificationsSent: 0 };
    }

    cityStats[city]!.found += result.apiFound || 0;
    cityStats[city]!.storedToDb += result.storedToDb || 0;
    cityStats[city]!.matched += result.matched || 0;
    totalNew += result.storedToDb || 0;

    // Merge matched apartments
    for (const [apartmentId, searchIds] of result.matchedApartments || []) {
      const existing = allMatchedApartments.get(apartmentId) || [];
      allMatchedApartments.set(apartmentId, [...existing, ...searchIds]);
    }
  }

  logger.scheduler.info('cycle.results_aggregated', `Aggregated results`, {
    cycleId,
    totalNew,
    matchedApartments: allMatchedApartments.size,
    cityStats,
  });

  // Queue notifications
  let notificationsQueued = 0;

  if (allMatchedApartments.size > 0 && notificationQueue) {
    const { queued } = await queueNotificationsForMatches(allMatchedApartments);
    notificationsQueued = queued;

    logger.scheduler.info('cycle.notifications_queued', `Queued ${notificationsQueued} notifications`, {
      cycleId,
      notificationsQueued,
    });
  }

  // Clean up Redis keys
  const keysToDelete = [
    keys.groups,
    keys.completed,
    keys.startTime,
    keys.cityStats,
    ...groupKeys.map(gk => keys.results(gk)),
  ];
  await redis.del(...keysToDelete);

  logger.scheduler.info('cycle.completed', `Cycle ${cycleId} completed`, {
    cycleId,
    totalNew,
    notificationsQueued,
    cycleDuration,
    cityStats,
  });

  // Update metrics
  metrics.cronJobRuns.inc({ job_name: 'cycle-complete', status: 'completed', forced: 'false' });
  metrics.cronJobDuration.observe({ job_name: 'fetch_cycle' }, cycleDuration / 1000);
  metrics.fetchCycleDuration.observe(cycleDuration / 1000);

  // Schedule next cycle
  const delay = getNextFetchDelayMs();
  await fetchQueue?.add('cycle-start', { type: 'cycle-start' } as CycleStartJobData, { delay });

  logger.scheduler.info('cycle.next_scheduled', `Next cycle scheduled in ${Math.round(delay / 1000 / 60)} minutes`, {
    delay,
    kyivHour: getKyivHour(),
  });

  return {
    newApartments: totalNew,
    notificationsQueued,
    skipped: false,
    cityStats,
  };
}

// Queue notifications for matched apartments
async function queueNotificationsForMatches(
  matchedApartments: Map<string, string[]>
): Promise<{ queued: number }> {
  // Import prisma here to avoid circular dependency
  const { prisma } = await import('../lib/prisma.js');

  let queued = 0;

  for (const [apartmentId, searchIds] of matchedApartments) {
    // Get apartment details
    const apartment = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: {
        id: true,
        title: true,
        city: true,
        district: true,
        address: true,
        price: true,
        currency: true,
        rooms: true,
        area: true,
        floor: true,
        totalFloors: true,
        isFromRealtor: true,
        agencyName: true,
        commission: true,
        petsFriendly: true,
        publishedAt: true,
        url: true,
        photos: true,
      },
    });

    if (!apartment) continue;

    // Get unique users from matched searches
    const searches = await prisma.search.findMany({
      where: {
        id: { in: searchIds },
        notifyEnabled: true,
      },
      include: {
        user: true,
      },
    });

    // Group by user
    const userSearches = new Map<string, { chatId: string; searchIds: string[] }>();

    for (const search of searches) {
      if (!search.user.notificationsEnabled) continue;

      // Skip historical apartments
      if (apartment.publishedAt && apartment.publishedAt <= search.createdAt) {
        continue;
      }

      // User's Telegram ID is the User.id (bigint)
      const chatId = search.userId.toString();
      const existing = userSearches.get(chatId) || { chatId, searchIds: [] };
      existing.searchIds.push(search.id);
      userSearches.set(chatId, existing);
    }

    // Queue notification for each user
    for (const [chatId, data] of userSearches) {
      // Check if already sent
      const alreadySent = await prisma.sentApartment.findFirst({
        where: {
          apartmentId,
          searchId: { in: data.searchIds },
        },
      });

      if (alreadySent) continue;

      await notificationQueue?.add(
        'send-notification',
        {
          odaId: uuidv4(),
          chatId,
          apartmentId,
          searchIds: data.searchIds,
          apartment,
        } as NotificationJobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      queued++;
    }
  }

  return { queued };
}

// Process fetch job (router)
async function processFetchJob(job: Job<FetchJobData>): Promise<FetchJobResult | void> {
  const jobType = job.data.type as FetchJobType;

  switch (jobType) {
    case 'cycle-start':
      await processCycleStart(job as Job<CycleStartJobData>);
      return;

    case 'city-fetch':
      await processCityFetch(job as Job<CityFetchJobData>);
      return;

    case 'cycle-complete':
      return processCycleComplete(job as Job<CycleCompleteJobData>);

    default:
      logger.scheduler.warn('job.unknown_type', `Unknown job type: ${jobType}`);
  }
}

// Start the scheduler with BullMQ
export async function startScheduler(): Promise<void> {
  if (fetchQueue) {
    logger.scheduler.info('scheduler.already_running', 'Scheduler already running');
    return;
  }

  logger.scheduler.info('scheduler.starting', 'Starting BullMQ scheduler...', {
    kyivHour: getKyivHour(),
    fetchConcurrency: FETCH_CONCURRENCY,
  });

  // Create fetch queue
  fetchQueue = new Queue(FETCH_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000,
      },
    },
  });

  // Create notification queue with rate limiter
  notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

  // Create fetch worker with concurrency
  fetchWorker = new Worker(
    FETCH_QUEUE_NAME,
    processFetchJob,
    {
      connection: redis,
      concurrency: FETCH_CONCURRENCY,
    }
  );

  // Create notification worker with rate limiter
  notificationWorker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    {
      connection: redis,
      concurrency: 1,
      limiter: {
        max: 25,
        duration: 1000,
      },
    }
  );

  // Worker event handlers
  fetchWorker.on('completed', (job, result) => {
    if (job.data.type === 'cycle-complete' && result) {
      logger.scheduler.info('queue.cycle_completed', `Cycle job ${job.id} completed`, {
        job: { jobId: job.id, jobName: job.data.type },
        result,
      });
    }
    updateQueueMetrics();
  });

  fetchWorker.on('failed', (job, err) => {
    logger.scheduler.error('queue.job_failed', `Job ${job?.id} failed: ${err.message}`, {
      job: { jobId: job?.id, jobName: job?.data?.type },
      error: { error: err.message, stack: err.stack },
    });
    metrics.errors.inc({ type: 'queue_error', component: 'scheduler' });
    updateQueueMetrics();
  });

  notificationWorker.on('completed', (job) => {
    logger.notifier.debug('notification.job_completed', `Notification job ${job.id} completed`, {
      user: { userId: job.data.chatId },
      notification: { status: 'sent' },
    });
  });

  notificationWorker.on('failed', (job, err) => {
    logger.notifier.error('notification.job_failed', `Notification job ${job?.id} failed: ${err.message}`, {
      user: { userId: job?.data?.chatId },
      notification: { status: 'failed' },
      error: { error: err.message, stack: err.stack },
    });
  });

  // Start first cycle
  const kyivHour = getKyivHour();
  if (shouldSkipFetch()) {
    const delay = getNextFetchDelayMs();
    await fetchQueue.add('cycle-start', { type: 'cycle-start' } as CycleStartJobData, { delay });

    logger.scheduler.info('scheduler.started', 'Scheduler started - night time, first cycle scheduled', {
      kyivHour,
      firstCycleDelay: delay,
      firstCycleDelayMinutes: Math.round(delay / 1000 / 60),
    });
  } else {
    await fetchQueue.add('cycle-start', { type: 'cycle-start' } as CycleStartJobData);

    logger.scheduler.info('scheduler.started', 'Scheduler started - day time, first cycle started', {
      kyivHour,
    });
  }

  updateQueueMetrics();
}

// Process notification job
async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { chatId, apartmentId, searchIds, apartment } = job.data;

  // Import here to avoid circular dependency
  const { sendApartmentNotification } = await import('./notificationSender.js');
  const { prisma } = await import('../lib/prisma.js');

  const success = await sendApartmentNotification(
    BigInt(chatId),
    apartment,
    searchIds[0] || 'queued'
  );

  if (success) {
    // Mark as sent for all matching searches
    for (const searchId of searchIds.slice(1)) {
      try {
        await prisma.sentApartment.create({
          data: { searchId, apartmentId },
        });
      } catch {
        // Ignore duplicates
      }
    }

    metrics.notificationsSent.inc({ status: 'sent', city: apartment.city, has_photo: String(apartment.photos.length > 0) });
  } else {
    throw new Error(`Failed to send notification to ${chatId}`);
  }
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

  // Add a forced cycle-start job
  await fetchQueue.add('cycle-start', { type: 'cycle-start', force: true } as CycleStartJobData);

  return {
    newApartments: 0,
    notificationsQueued: 0,
    skipped: false,
    cityStats: {},
  };
}

// Stop the scheduler
export async function stopScheduler(): Promise<void> {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
  }
  if (fetchWorker) {
    await fetchWorker.close();
    fetchWorker = null;
  }
  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
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

  let notificationStats = null;
  if (notificationQueue) {
    const [nWaiting, nActive, nCompleted, nFailed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
    ]);
    notificationStats = {
      waiting: nWaiting,
      active: nActive,
      completed: nCompleted,
      failed: nFailed,
    };
  }

  return {
    fetch: {
      waiting,
      active,
      completed,
      failed,
      delayed,
    },
    notifications: notificationStats,
    kyivHour: getKyivHour(),
    nextFetchIn: `${(getNextFetchDelayMs() / 1000 / 60).toFixed(0)} min`,
    concurrency: FETCH_CONCURRENCY,
  };
}

// Export queues for Bull Board
export function getFetchQueue(): Queue | null {
  return fetchQueue;
}

export function getNotificationQueue(): Queue | null {
  return notificationQueue;
}
