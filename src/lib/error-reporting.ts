/**
 * Lightweight error reporting utility.
 * Logs errors to console in development, and can be extended to send
 * to an external service (Sentry, LogRocket, etc.) in production.
 *
 * Usage:
 *   import { reportError } from '@/lib/error-reporting';
 *   reportError(error, { context: 'admin-page', userId: 'admin1' });
 */

interface ErrorContext {
  /** Which part of the app the error occurred in */
  context?: string;
  /** Any additional metadata to attach */
  [key: string]: unknown;
}

const IS_SERVER = typeof window === 'undefined';
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Report an error for monitoring.
 * In development: logs to console with full context.
 * In production: logs a structured JSON line (picked up by Vercel logs).
 * Can be extended to send to Sentry, LogRocket, etc.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const timestamp = new Date().toISOString();

  const payload = {
    timestamp,
    message: errorObj.message,
    stack: errorObj.stack?.split('\n').slice(0, 5).join('\n'),
    ...context,
  };

  if (IS_PROD) {
    // Structured JSON logging — Vercel picks this up in Log Drains
    if (IS_SERVER) {
      console.error(JSON.stringify({ level: 'error', ...payload }));
    } else {
      // Client-side: could POST to /api/log endpoint in the future
      console.error('[BuFaisal Error]', payload);
    }
  } else {
    // Development: rich console output
    console.error('🔴 [Error Report]', payload);
  }
}

/**
 * Wrap an async function with automatic error reporting.
 * Useful for API route handlers and server actions.
 */
export function withErrorReporting<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: ErrorContext,
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(error, context);
      throw error;
    }
  }) as T;
}
