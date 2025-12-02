// Structured Logger for Grafana Loki
// Outputs JSON logs that can be easily parsed and queried
// Sends logs to Grafana Cloud via Loki Push API

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface UserContext {
  userId?: string | number | bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isPremium?: boolean;
  isBot?: boolean;
}

interface SearchContext {
  searchId?: string;
  city?: string;
  propertyType?: string;
  apartmentType?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  rooms?: number[];
  areaMin?: number | null;
  areaMax?: number | null;
  floorMin?: number | null;
  floorMax?: number | null;
  withoutRealtors?: boolean;
  petsFriendly?: boolean;
}

interface ApartmentContext {
  apartmentId?: string;
  externalId?: string;
  city?: string;
  price?: number;
  rooms?: number | null;
  area?: number | null;
  isFromRealtor?: boolean;
  url?: string;
}

interface NotificationContext {
  notificationId?: string;
  messageId?: number;
  status?: 'sent' | 'failed';
  hasPhoto?: boolean;
  photoFallback?: boolean;
}

interface JobContext {
  jobId?: string;
  jobName?: string;
  forced?: boolean;
  kyivHour?: number;
  delay?: number;
}

interface ApiContext {
  method?: string;
  path?: string;
  statusCode?: number;
  responseTime?: number;
}

interface ErrorContext {
  error?: string;
  errorCode?: string;
  stack?: string;
}

interface LogContext {
  // Core identifiers
  traceId?: string;

  // User info
  user?: UserContext;

  // Search info
  search?: SearchContext;

  // Apartment info
  apartment?: ApartmentContext;

  // Notification info
  notification?: NotificationContext;

  // Job info
  job?: JobContext;

  // API info
  api?: ApiContext;

  // Error info
  error?: ErrorContext;

  // Metrics
  duration?: number;
  count?: number;

  // Custom fields
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  component: string;
  event: string;
  message: string;
  context: LogContext;
}

// Generate trace ID for request correlation
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Grafana Cloud Loki Push API - Simple direct HTTP approach
// More reliable than OTLP SDK which has ESM/CJS compatibility issues

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPushRequest {
  streams: LokiStream[];
}

class LokiExporter {
  private lokiUrl: string;
  private authHeader: string;
  private logBuffer: Array<{ labels: Record<string, string>; timestamp: string; line: string }> = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private isEnabled = false;

  constructor() {
    // Use dedicated Loki credentials if available, otherwise fall back to OTLP credentials
    const lokiUrl = process.env.GRAFANA_LOKI_URL;
    const lokiUser = process.env.GRAFANA_LOKI_USER || process.env.GRAFANA_CLOUD_USER;
    const token = process.env.GRAFANA_CLOUD_TOKEN;

    if (!lokiUser || !token) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'apartment-bot',
        component: 'logger',
        event: 'loki.disabled',
        message: 'Loki export disabled - missing credentials',
        context: {},
      }));
      return;
    }

    // Use explicit Loki URL or derive from OTLP endpoint
    if (lokiUrl) {
      this.lokiUrl = `${lokiUrl}/loki/api/v1/push`;
    } else {
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
      const region = endpoint.match(/prod-([a-z]+-[a-z]+-\d+)/)?.[1] || 'eu-west-2';
      this.lokiUrl = `https://logs-prod-${region}.grafana.net/loki/api/v1/push`;
    }
    this.authHeader = `Basic ${Buffer.from(`${lokiUser}:${token}`).toString('base64')}`;
    this.isEnabled = true;

    // Flush logs every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);

    // Flush on process exit
    process.on('beforeExit', () => this.flush());

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'apartment-bot',
      component: 'logger',
      event: 'loki.initialized',
      message: 'Loki log export initialized for Grafana Cloud',
      context: { lokiUrl: this.lokiUrl },
    }));
  }

  push(labels: Record<string, string>, logLine: string): void {
    if (!this.isEnabled) return;

    // Nanosecond timestamp for Loki
    const timestamp = (Date.now() * 1_000_000).toString();
    this.logBuffer.push({ labels, timestamp, line: logLine });

    // Auto-flush if buffer gets large
    if (this.logBuffer.length >= 100) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    // Group logs by label set
    const streamMap = new Map<string, LokiStream>();

    for (const log of logsToSend) {
      const labelKey = JSON.stringify(log.labels);

      if (!streamMap.has(labelKey)) {
        streamMap.set(labelKey, {
          stream: log.labels,
          values: [],
        });
      }

      streamMap.get(labelKey)!.values.push([log.timestamp, log.line]);
    }

    const payload: LokiPushRequest = {
      streams: Array.from(streamMap.values()),
    };

    try {
      const response = await fetch(this.lokiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'apartment-bot',
          component: 'logger',
          event: 'loki.push_failed',
          message: `Loki push failed: ${response.status}`,
          context: { status: response.status, error: errorText, lokiUrl: this.lokiUrl },
        }));
      }
    } catch (error) {
      // Log network errors to help debug connection issues
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'apartment-bot',
        component: 'logger',
        event: 'loki.network_error',
        message: `Loki network error: ${error instanceof Error ? error.message : String(error)}`,
        context: {
          lokiUrl: this.lokiUrl,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// Global Loki exporter instance
const lokiExporter = new LokiExporter();

// Serialize BigInt values
function serializeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeValue(v);
    }
    return result;
  }
  return value;
}

// Flatten nested context for OTLP attributes (Loki works better with flat labels)
function flattenContext(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[newKey] = value;
    } else if (Array.isArray(value)) {
      // Convert arrays to comma-separated string
      result[newKey] = value.map(v => String(v)).join(',');
    } else if (typeof value === 'object') {
      // Recursively flatten nested objects
      Object.assign(result, flattenContext(value as Record<string, unknown>, newKey));
    }
  }

  return result;
}

class Logger {
  private service = 'apartment-bot';
  private component: string;
  private traceId?: string;

  constructor(component: string) {
    this.component = component;
  }

  // Create child logger with trace ID for request correlation
  withTrace(traceId?: string): Logger {
    const child = new Logger(this.component);
    child.traceId = traceId || generateTraceId();
    return child;
  }

  // Create child logger for specific component
  child(component: string): Logger {
    const child = new Logger(component);
    child.traceId = this.traceId;
    return child;
  }

  private log(level: LogLevel, event: string, message: string, context: LogContext = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      component: this.component,
      event,
      message,
      context: {
        ...serializeValue(context) as LogContext,
        ...(this.traceId && { traceId: this.traceId }),
      },
    };

    const output = JSON.stringify(entry);

    // Output to console
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }

    // Send to Grafana Cloud Loki
    try {
      // Labels for Loki (indexed fields - keep minimal)
      const labels: Record<string, string> = {
        service: this.service,
        component: this.component,
        level: level,
        event: event,
      };

      // Add optional labels
      if (this.traceId) {
        labels.trace_id = this.traceId;
      }

      // Send full JSON log line
      lokiExporter.push(labels, output);
    } catch {
      // Silently ignore Loki errors to not affect main logging
    }
  }

  // Debug level
  debug(event: string, message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.log('debug', event, message, context);
    }
  }

  // Info level
  info(event: string, message: string, context?: LogContext): void {
    this.log('info', event, message, context);
  }

  // Warn level
  warn(event: string, message: string, context?: LogContext): void {
    this.log('warn', event, message, context);
  }

  // Error level
  error(event: string, message: string, context?: LogContext): void {
    this.log('error', event, message, context);
  }

  // ============================================
  // Pre-defined event loggers for common actions
  // ============================================

  // User Events
  userStarted(user: UserContext, isNewUser: boolean, dbSuccess: boolean): void {
    this.info('user.started', `User ${isNewUser ? 'registered' : 'returned'}`, {
      user,
      isNewUser,
      dbSuccess,
    });
  }

  userModeSelected(user: UserContext, mode: 'ui' | 'native'): void {
    this.info('user.mode_selected', `User selected ${mode} mode`, {
      user,
      mode,
    });
  }

  userDbError(user: UserContext, error: Error): void {
    this.error('user.db_error', 'Failed to save user to database', {
      user,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  // Search Events
  searchCreated(user: UserContext, search: SearchContext, source: 'wizard' | 'api'): void {
    this.info('search.created', `Search created via ${source}`, {
      user,
      search,
      source,
    });
  }

  searchUpdated(user: UserContext, search: SearchContext, changes: Record<string, unknown>): void {
    this.info('search.updated', 'Search updated', {
      user,
      search,
      changes,
    });
  }

  searchDeleted(user: UserContext, searchId: string): void {
    this.info('search.deleted', 'Search deleted', {
      user,
      search: { searchId },
    });
  }

  searchWizardStep(user: UserContext, step: string, data: Record<string, unknown>): void {
    this.debug('search.wizard_step', `Wizard step: ${step}`, {
      user,
      step,
      ...data,
    });
  }

  searchWizardCancelled(user: UserContext, atStep: string): void {
    this.info('search.wizard_cancelled', `Search wizard cancelled at step: ${atStep}`, {
      user,
      step: atStep,
    });
  }

  searchDbError(user: UserContext, search: SearchContext, error: Error): void {
    this.error('search.db_error', 'Failed to save search to database', {
      user,
      search,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  // Notification Events
  notificationSent(
    user: UserContext,
    apartment: ApartmentContext,
    notification: NotificationContext,
    searchIds: string[]
  ): void {
    this.info('notification.sent', 'Notification sent successfully', {
      user,
      apartment,
      notification,
      searchIds,
    });
  }

  notificationFailed(
    user: UserContext,
    apartment: ApartmentContext,
    error: Error,
    searchIds: string[]
  ): void {
    this.error('notification.failed', 'Failed to send notification', {
      user,
      apartment,
      searchIds,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  notificationPhotoFallback(apartment: ApartmentContext): void {
    this.warn('notification.photo_fallback', 'Photo failed, falling back to text', {
      apartment,
    });
  }

  notificationBatchComplete(sent: number, failed: number, duration: number): void {
    this.info('notification.batch_complete', `Notification batch complete: ${sent} sent, ${failed} failed`, {
      count: sent + failed,
      sent,
      failed,
      duration,
    });
  }

  // Cron/Scheduler Events
  cronJobStarted(job: JobContext, params: Record<string, unknown>): void {
    this.info('cron.started', `Cron job started: ${job.jobName}`, {
      job,
      params,
    });
  }

  cronJobCompleted(job: JobContext, result: Record<string, unknown>, duration: number): void {
    this.info('cron.completed', `Cron job completed: ${job.jobName}`, {
      job,
      result,
      duration,
    });
  }

  cronJobFailed(job: JobContext, error: Error): void {
    this.error('cron.failed', `Cron job failed: ${job.jobName}`, {
      job,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  cronJobSkipped(job: JobContext, reason: string): void {
    this.info('cron.skipped', `Cron job skipped: ${reason}`, {
      job,
      reason,
    });
  }

  cronScheduled(nextRunIn: number, kyivHour: number): void {
    this.info('cron.scheduled', `Next job scheduled in ${Math.round(nextRunIn / 60000)} minutes`, {
      job: {
        delay: nextRunIn,
        kyivHour,
      },
    });
  }

  // Apartment Fetch Events
  fetchCycleStarted(groupsCount: number): void {
    this.info('fetch.cycle_started', `Fetch cycle started with ${groupsCount} groups`, {
      count: groupsCount,
    });
  }

  fetchGroupStarted(
    city: string,
    propertyType: string,
    apartmentType: string,
    searchCount: number,
    params: Record<string, unknown>
  ): void {
    this.info('fetch.group_started', `Fetching: ${city} ${propertyType} ${apartmentType}`, {
      city,
      propertyType,
      apartmentType,
      searchCount,
      params,
    });
  }

  fetchGroupCompleted(
    city: string,
    found: number,
    newCount: number,
    matchedCount: number,
    duration: number
  ): void {
    this.info('fetch.group_completed', `Fetch completed for ${city}`, {
      city,
      found,
      newCount,
      matchedCount,
      duration,
    });
  }

  fetchGroupError(city: string, error: Error): void {
    this.error('fetch.group_error', `Fetch error for ${city}`, {
      city,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  apartmentStored(apartment: ApartmentContext, isNew: boolean): void {
    this.debug('apartment.stored', `Apartment ${isNew ? 'created' : 'updated'}`, {
      apartment,
      isNew,
    });
  }

  apartmentMatched(apartment: ApartmentContext, searchIds: string[]): void {
    this.info('apartment.matched', `Apartment matched ${searchIds.length} searches`, {
      apartment,
      searchIds,
      matchCount: searchIds.length,
    });
  }

  fetchCycleCompleted(
    totalNew: number,
    totalMatched: number,
    duration: number
  ): void {
    this.info('fetch.cycle_completed', `Fetch cycle completed`, {
      totalNew,
      totalMatched,
      duration,
    });
  }

  // API Events
  apiRequest(api: ApiContext, user?: UserContext): void {
    this.info('api.request', `${api.method} ${api.path}`, {
      api,
      user,
    });
  }

  apiResponse(api: ApiContext, user?: UserContext): void {
    this.info('api.response', `${api.method} ${api.path} -> ${api.statusCode}`, {
      api,
      user,
    });
  }

  apiError(api: ApiContext, error: Error, user?: UserContext): void {
    this.error('api.error', `API error: ${api.method} ${api.path}`, {
      api,
      user,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  // DOM.RIA API Events
  domriaSearchRequest(city: string, params: Record<string, unknown>): void {
    this.info('domria.search', `DOM.RIA search: ${city}`, {
      city,
      params,
    });
  }

  domriaSearchResponse(city: string, count: number, duration: number): void {
    this.info('domria.search_response', `DOM.RIA returned ${count} results for ${city}`, {
      city,
      count,
      duration,
    });
  }

  domriaDetailRequest(apartmentId: number): void {
    this.debug('domria.detail', `DOM.RIA detail: ${apartmentId}`, {
      apartmentId,
    });
  }

  domriaError(operation: string, error: Error, context?: Record<string, unknown>): void {
    this.error('domria.error', `DOM.RIA error: ${operation}`, {
      operation,
      ...context,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  // Database Events
  dbQuerySlow(operation: string, duration: number, query?: string): void {
    this.warn('db.slow_query', `Slow query: ${operation} took ${duration}ms`, {
      operation,
      duration,
      query,
    });
  }

  dbError(operation: string, error: Error): void {
    this.error('db.error', `Database error: ${operation}`, {
      operation,
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }

  // Redis Events
  redisError(error: Error): void {
    this.error('redis.error', 'Redis connection error', {
      error: {
        error: error.message,
        stack: error.stack,
      },
    });
  }
}

// Create component-specific loggers
export const logger = {
  app: new Logger('app'),
  bot: new Logger('bot'),
  api: new Logger('api'),
  scheduler: new Logger('scheduler'),
  fetcher: new Logger('fetcher'),
  notifier: new Logger('notifier'),
  domria: new Logger('domria'),
  db: new Logger('database'),
  redis: new Logger('redis'),
};

// Export for custom component loggers
export { Logger, LogContext, UserContext, SearchContext, ApartmentContext };
