// Circuit Breaker for DOM.RIA API protection
// Prevents cascading failures when API is rate-limited or down

import { redis } from './redis.js';
import { logger } from './logger.js';

const CIRCUIT_KEY = 'domria:circuit:errors';
const CIRCUIT_OPEN_KEY = 'domria:circuit:open';
const ERROR_THRESHOLD = 5;      // Number of errors before opening circuit
const WINDOW_SECONDS = 60;      // Time window for error counting
const OPEN_DURATION_SECONDS = 30; // How long circuit stays open

export interface CircuitState {
  isOpen: boolean;
  errorCount: number;
  lastError?: string;
}

/**
 * Check if the circuit breaker is open (blocking requests)
 */
export async function isCircuitOpen(): Promise<boolean> {
  const isOpen = await redis.get(CIRCUIT_OPEN_KEY);
  return isOpen === '1';
}

/**
 * Get current circuit state for monitoring
 */
export async function getCircuitState(): Promise<CircuitState> {
  const [isOpen, errorCount] = await Promise.all([
    redis.get(CIRCUIT_OPEN_KEY),
    redis.get(CIRCUIT_KEY),
  ]);

  return {
    isOpen: isOpen === '1',
    errorCount: parseInt(errorCount || '0', 10),
  };
}

/**
 * Record an API error - may trip the circuit breaker
 */
export async function recordError(errorMessage?: string): Promise<void> {
  // Increment error count with TTL
  const errorCount = await redis.incr(CIRCUIT_KEY);

  // Set/reset expiry on the counter
  await redis.expire(CIRCUIT_KEY, WINDOW_SECONDS);

  logger.domria.warn('circuit_breaker.error_recorded', `API error recorded (${errorCount}/${ERROR_THRESHOLD})`, {
    errorCount,
    threshold: ERROR_THRESHOLD,
    errorMessage,
  });

  // Check if we should open the circuit
  if (errorCount >= ERROR_THRESHOLD) {
    await openCircuit();
  }
}

/**
 * Record a successful API call - helps reset the circuit
 */
export async function recordSuccess(): Promise<void> {
  // Reset error count on success (helps recovery)
  const errorCount = await redis.get(CIRCUIT_KEY);
  if (errorCount && parseInt(errorCount, 10) > 0) {
    // Decrement but don't go below 0
    await redis.decr(CIRCUIT_KEY);
  }
}

/**
 * Open the circuit breaker - blocks requests for OPEN_DURATION_SECONDS
 */
async function openCircuit(): Promise<void> {
  await redis.setex(CIRCUIT_OPEN_KEY, OPEN_DURATION_SECONDS, '1');

  logger.domria.error('circuit_breaker.opened', `Circuit breaker OPENED - blocking requests for ${OPEN_DURATION_SECONDS}s`, {
    openDuration: OPEN_DURATION_SECONDS,
    errorThreshold: ERROR_THRESHOLD,
  });
}

/**
 * Manually close/reset the circuit breaker
 */
export async function resetCircuit(): Promise<void> {
  await Promise.all([
    redis.del(CIRCUIT_OPEN_KEY),
    redis.del(CIRCUIT_KEY),
  ]);

  logger.domria.info('circuit_breaker.reset', 'Circuit breaker manually reset');
}

/**
 * Wrapper to check circuit before making API calls
 * Throws if circuit is open
 */
export async function checkCircuit(): Promise<void> {
  if (await isCircuitOpen()) {
    const state = await getCircuitState();
    throw new Error(`Circuit breaker is OPEN - API requests blocked. Errors: ${state.errorCount}`);
  }
}
