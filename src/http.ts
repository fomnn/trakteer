/**
 * Minimal HTTP layer for the Trakteer utils.
 *
 * Requests go through ofetch, which handles timeouts, JSON bodies and header
 * merging. The response body is read as text so that non-JSON endpoints (the
 * scraped HTML pages) and error payloads share the same path.
 */

import { createFetch, FetchError, ofetch, type FetchResponse } from "ofetch";

export type FetchLike = typeof fetch;

/** Default request timeout. */
const REQUEST_TIMEOUT = 15_000;

export interface RequestOptions {
  /** Override fetch, e.g. to route requests through an egress proxy. */
  fetch?: FetchLike;
  headers?: Record<string, string | undefined>;
  /** Serialized as a JSON body, with Content-Type: application/json. */
  json?: unknown;
  method?: "GET" | "POST";
  /** Serialized into the URL query string by ofetch. */
  query?: Record<string, boolean | number | string | undefined>;
  /** Aborts the request in addition to the built-in timeout. */
  signal?: AbortSignal;
}

export class TrakteerHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(errorMessage(status, body));
    this.name = "TrakteerHttpError";
    this.status = status;
    this.body = body;
  }
}

function errorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed?.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    // Not JSON; fall back to the status-based message.
  }
  return `Trakteer request failed with status ${status}`;
}

function compactHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

/** ofetch only takes a custom fetch as a client-level option. */
function client(fetchImpl?: FetchLike) {
  return fetchImpl ? createFetch({ fetch: fetchImpl }) : ofetch;
}

/** ofetch aborts with a TimeoutError, either its own or from AbortSignal.timeout. */
function isTimeout(error: unknown): boolean {
  if (!(error instanceof FetchError)) {
    return false;
  }
  const cause = error.cause as { code?: number; name?: string } | undefined;
  return cause?.name === "TimeoutError" || cause?.code === 23;
}

/** Performs a request and returns the raw response plus its text body. */
export async function request(
  url: string,
  options: RequestOptions = {},
): Promise<{ body: string; response: Response }> {
  // ofetch only applies `timeout` when no signal is passed, so combine the two.
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT)])
    : undefined;

  let response: FetchResponse<string>;
  try {
    response = await client(options.fetch).raw<string, "text">(url, {
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      headers: compactHeaders({
        Accept: "application/json",
        ...options.headers,
      }),
      ignoreResponseError: true,
      method: options.method ?? "GET",
      query: options.query,
      responseType: "text",
      // Keep retries off: callers decide how to handle a failed request.
      retry: 0,
      signal,
      timeout: signal ? undefined : REQUEST_TIMEOUT,
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new Error(`Trakteer request timed out after ${REQUEST_TIMEOUT} ms: ${url}`, {
        cause: error,
      });
    }
    throw error;
  }

  const body = response._data ?? "";
  if (!response.ok) {
    throw new TrakteerHttpError(response.status, body);
  }

  return { body, response };
}

/** Performs a request and parses the body as JSON. */
export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body } = await request(url, options);
  try {
    return JSON.parse(body) as T;
  } catch {
    const preview = body.length > 200 ? `${body.slice(0, 200)}...` : body;
    throw new Error(`Unexpected non-JSON response from ${url}: ${preview}`);
  }
}
