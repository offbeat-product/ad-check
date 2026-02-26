/** Fetch wrapper with retry, timeout, and exponential backoff */

export interface RetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  initialDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 2,
  timeoutMs: 120_000, // 2 minutes for AI checks
  initialDelayMs: 1000,
};

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`リクエストがタイムアウトしました（${Math.round(timeoutMs / 1000)}秒）`);
    this.name = "FetchTimeoutError";
  }
}

export class FetchRetryExhaustedError extends Error {
  public lastError: Error;
  constructor(attempts: number, lastError: Error) {
    super(`${attempts}回の試行後も失敗しました: ${lastError.message}`);
    this.name = "FetchRetryExhaustedError";
    this.lastError = lastError;
  }
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const merged: RequestInit = { ...init, signal: controller.signal };
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, merged).finally(() => clearTimeout(timer));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true; // timeout
  if (error instanceof TypeError) return true; // network error
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const { maxRetries, timeoutMs, initialDelayMs } = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (response.ok) return response;

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        lastError = new Error(`Webhook error: ${response.status}`);
        options.onRetry?.(attempt + 1, lastError);
        await sleep(initialDelayMs * Math.pow(2, attempt));
        continue;
      }

      // Non-retryable HTTP error
      throw new Error(`Webhook error: ${response.status}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new FetchTimeoutError(timeoutMs);
      } else if (error instanceof Error) {
        lastError = error;
      }

      if (attempt < maxRetries && isRetryable(error)) {
        options.onRetry?.(attempt + 1, lastError);
        await sleep(initialDelayMs * Math.pow(2, attempt));
        continue;
      }

      if (attempt >= maxRetries) break;
      throw lastError;
    }
  }

  throw new FetchRetryExhaustedError(maxRetries + 1, lastError);
}
