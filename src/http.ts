/**
 * Minimal HTTP layer for the Trakteer utils.
 *
 * Requests go through ofetch, which handles timeouts, JSON bodies and header
 * merging. The response body is read as text so that non-JSON endpoints (the
 * scraped HTML pages) and error payloads share the same path.
 *
 * @module
 */

import { createFetch, FetchError, ofetch, type FetchResponse } from "ofetch";

/** A `fetch`-compatible function, used to override the transport globally per call. */
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

/**
 * Error thrown when Trakteer answers with a non-2xx status.
 *
 * The message is taken from the JSON `message` field when the body has one,
 * and falls back to the status code. The raw body is kept so callers can
 * inspect validation errors.
 *
 * @example
 * ```ts
 * import { TrakteerHttpError, TrakteerPayment } from "@fomnn/trakteer";
 *
 * try {
 *   await TrakteerPayment.getPaymentMethods();
 * } catch (error) {
 *   if (error instanceof TrakteerHttpError) {
 *     console.error(error.status, error.body);
 *   }
 * }
 * ```
 */
export class TrakteerHttpError extends Error {
  /** HTTP status code, e.g. `404`. */
  readonly status: number;
  /** Raw, unparsed response body. */
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

/**
 * Performs a request and returns the raw response plus its text body.
 *
 * @param url Absolute URL to request.
 * @param options Request body, headers and transport overrides.
 * @returns The response and its body, read as text.
 * @throws {TrakteerHttpError} When the response status is not 2xx.
 * @throws {Error} When the request times out.
 */
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

/**
 * Performs a request and parses the body as JSON.
 *
 * @typeParam T Expected response shape; it is not validated here.
 * @param url Absolute URL to request.
 * @param options Request body, headers and transport overrides.
 * @returns The parsed body.
 * @throws {Error} When the body is not valid JSON.
 */
export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body } = await request(url, options);
  try {
    return JSON.parse(body) as T;
  } catch {
    const preview = body.length > 200 ? `${body.slice(0, 200)}...` : body;
    throw new Error(`Unexpected non-JSON response from ${url}: ${preview}`);
  }
}
