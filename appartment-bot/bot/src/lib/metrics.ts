// Prometheus Metrics for Grafana
// Full metrics with labels for detailed dashboards

import client from 'prom-client';

// Enable default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({
  prefix: 'bot_',
  labels: { app: 'apartment-bot' },
});

// ============================================
// User Metrics
// ============================================

export const userStarted = new client.Counter({
  name: 'bot_user_started_total',
  help: 'Total users who started the bot',
  labelNames: ['is_new', 'language', 'is_premium'] as const,
});

export const userModeSelected = new client.Counter({
  name: 'bot_user_mode_selected_total',
  help: 'User mode selections',
  labelNames: ['mode'] as const, // ui, native
});

export const userDbOperations = new client.Counter({
  name: 'bot_user_db_operations_total',
  help: 'User database operations',
  labelNames: ['operation', 'status'] as const, // upsert/find, success/error
});

// ============================================
// Search Metrics
// ============================================

export const searchCreated = new client.Counter({
  name: 'bot_search_created_total',
  help: 'Total searches created',
  labelNames: ['city', 'property_type', 'apartment_type', 'source'] as const, // source: wizard/api
});

export const searchUpdated = new client.Counter({
  name: 'bot_search_updated_total',
  help: 'Total searches updated',
  labelNames: ['city'] as const,
});

export const searchDeleted = new client.Counter({
  name: 'bot_search_deleted_total',
  help: 'Total searches deleted',
  labelNames: ['city'] as const,
});

export const searchWizardSteps = new client.Counter({
  name: 'bot_search_wizard_steps_total',
  help: 'Search wizard step completions',
  labelNames: ['step', 'outcome'] as const, // outcome: completed/cancelled/error
});

export const searchDbOperations = new client.Counter({
  name: 'bot_search_db_operations_total',
  help: 'Search database operations',
  labelNames: ['operation', 'status'] as const,
});

export const activeSearches = new client.Gauge({
  name: 'bot_active_searches',
  help: 'Current number of active searches',
  labelNames: ['city'] as const,
});

// ============================================
// Notification Metrics
// ============================================

export const notificationsSent = new client.Counter({
  name: 'bot_notifications_sent_total',
  help: 'Total notifications sent',
  labelNames: ['city', 'has_photo', 'status'] as const, // status: sent/failed
});

export const notificationDuration = new client.Histogram({
  name: 'bot_notification_duration_seconds',
  help: 'Time to send a notification',
  labelNames: ['city', 'has_photo'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const notificationPhotoFallbacks = new client.Counter({
  name: 'bot_notification_photo_fallbacks_total',
  help: 'Notifications where photo failed and fell back to text',
  labelNames: ['city'] as const,
});

export const notificationBatchSize = new client.Histogram({
  name: 'bot_notification_batch_size',
  help: 'Number of notifications in a batch',
  buckets: [1, 5, 10, 25, 50, 100],
});

// ============================================
// Cron/Scheduler Metrics
// ============================================

export const cronJobRuns = new client.Counter({
  name: 'bot_cron_job_runs_total',
  help: 'Total cron job executions',
  labelNames: ['job_name', 'status', 'forced'] as const, // status: started/completed/failed/skipped
});

export const cronJobDuration = new client.Histogram({
  name: 'bot_cron_job_duration_seconds',
  help: 'Cron job execution duration',
  labelNames: ['job_name'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

export const cronNextRunDelay = new client.Gauge({
  name: 'bot_cron_next_run_delay_seconds',
  help: 'Delay until next scheduled job',
});

export const cronKyivHour = new client.Gauge({
  name: 'bot_cron_kyiv_hour',
  help: 'Current hour in Kyiv timezone',
});

// ============================================
// Apartment Fetch Metrics
// ============================================

export const apartmentsFetched = new client.Counter({
  name: 'bot_apartments_fetched_total',
  help: 'Total apartments fetched from API',
  labelNames: ['city', 'property_type', 'apartment_type'] as const,
});

export const apartmentsStored = new client.Counter({
  name: 'bot_apartments_stored_total',
  help: 'Total apartments stored in database',
  labelNames: ['city', 'is_new'] as const, // is_new: true (created) / false (updated)
});

export const apartmentsMatched = new client.Counter({
  name: 'bot_apartments_matched_total',
  help: 'Total apartments matched to searches',
  labelNames: ['city'] as const,
});

export const fetchCycleDuration = new client.Histogram({
  name: 'bot_fetch_cycle_duration_seconds',
  help: 'Fetch cycle total duration',
  buckets: [10, 30, 60, 120, 300, 600],
});

export const fetchGroupDuration = new client.Histogram({
  name: 'bot_fetch_group_duration_seconds',
  help: 'Duration to fetch a single city/type group',
  labelNames: ['city', 'property_type'] as const,
  buckets: [1, 5, 10, 30, 60],
});

// ============================================
// DOM.RIA API Metrics
// ============================================

export const domriaRequests = new client.Counter({
  name: 'bot_domria_requests_total',
  help: 'Total DOM.RIA API requests',
  labelNames: ['endpoint', 'status'] as const, // endpoint: search/detail, status: success/error
});

export const domriaRequestDuration = new client.Histogram({
  name: 'bot_domria_request_duration_seconds',
  help: 'DOM.RIA API request duration',
  labelNames: ['endpoint'] as const,
  buckets: [0.5, 1, 2, 5, 10, 30],
});

export const domriaDailyRequests = new client.Gauge({
  name: 'bot_domria_daily_requests',
  help: 'DOM.RIA API requests today',
});

// ============================================
// Database Metrics
// ============================================

export const dbQueryDuration = new client.Histogram({
  name: 'bot_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation', 'table'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const dbErrors = new client.Counter({
  name: 'bot_db_errors_total',
  help: 'Total database errors',
  labelNames: ['operation', 'table'] as const,
});

export const dbSlowQueries = new client.Counter({
  name: 'bot_db_slow_queries_total',
  help: 'Queries exceeding threshold (500ms)',
  labelNames: ['operation', 'table'] as const,
});

// ============================================
// Error Metrics
// ============================================

export const errors = new client.Counter({
  name: 'bot_errors_total',
  help: 'Total errors by type',
  labelNames: ['type', 'component'] as const,
  // types: db_error, api_error, telegram_error, domria_error, validation_error
  // components: bot, api, scheduler, fetcher, notifier
});

// ============================================
// Queue Metrics
// ============================================

export const queueJobs = new client.Gauge({
  name: 'bot_queue_jobs',
  help: 'Current queue job counts',
  labelNames: ['status'] as const, // waiting, active, completed, failed, delayed
});

// ============================================
// Helpers
// ============================================

// Timer helper for histograms
export function startTimer(histogram: client.Histogram<string>, labels: Record<string, string>): () => void {
  const start = Date.now();
  return () => {
    const duration = (Date.now() - start) / 1000;
    histogram.observe(labels, duration);
  };
}

// Export the client for /metrics endpoint
export { client };

// Get all metrics as Prometheus format
export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

// Get metrics content type
export function getMetricsContentType(): string {
  return client.register.contentType;
}
