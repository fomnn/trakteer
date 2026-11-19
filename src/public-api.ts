import { requestJson, type FetchLike } from "./http";
import { countEnvelopeSchema, envelopeSchema, expect } from "./schemas";
import type { SupportHistory, TransactionHistory } from "./types";

const BASE_URL = "https://api.trakteer.id/v1/public";

type Status = "success" | "error";

export interface PublicApiOptions {
  /** API key from https://trakteer.id/manage/api-trakteer */
  apiKey: string;
  /** Override fetch, e.g. to route requests through an egress proxy. */
  fetch?: FetchLike;
  userAgent?: string;
}

interface Envelope<T> {
  message?: string;
  result?: T;
  status?: Status;
}

function assertSuccess<T>(body: unknown, fallback: string): T {
  const envelope = expect<Envelope<unknown>>(envelopeSchema, body, "public API");
  if (envelope.status === "error") {
    throw new Error(envelope.message ?? fallback);
  }
  return body as T;
}

function readResult<T>(body: unknown, fallback: string): T {
  const envelope = expect<Envelope<T>>(countEnvelopeSchema, body, "public API");
  if (envelope.status === "error") {
    throw new Error(envelope.message ?? fallback);
  }
  if (envelope.result === undefined) {
    throw new Error(fallback);
  }
  return envelope.result;
}

function parseCount(value: unknown, context: string): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unexpected ${context} response: ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * Public API - uses the official API from Trakteer.
 * @see https://trakteer.id/manage/api-trakteer
 *
 * Unlike the upstream class, failures are thrown instead of returned as
 * `Error` values.
 */
export class TrakteerPublicApi {
  private readonly apiKey: string;
  private readonly fetchImpl?: FetchLike;
  private readonly userAgent?: string;

  constructor(options: PublicApiOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch;
    this.userAgent = options.userAgent;
  }

  private send<T>(
    path: string,
    init: {
      json?: unknown;
      method?: "GET" | "POST";
      query?: Record<string, number | string>;
    } = {},
  ): Promise<T> {
    return requestJson<T>(`${BASE_URL}${path}`, {
      ...init,
      fetch: this.fetchImpl,
      headers: {
        key: this.apiKey,
        "User-Agent": this.userAgent,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
  }

  /**
   * Number of units a supporter has given in the last 30 days, by email.
   */
  async quantityGiven(email: string): Promise<number> {
    const body = await this.send<unknown>("/quantity-given", {
      json: { email },
      method: "POST",
    });

    return parseCount(readResult(body, "Failed to get quantity given"), "quantity-given");
  }

  /** Support history of the account that owns the API key. */
  async supportHistory(limit = 10, page = 1): Promise<SupportHistory> {
    const body = await this.send<unknown>("/supports", { query: { limit, page } });

    return assertSuccess<SupportHistory>(body, "Failed to get support history");
  }

  /** Current balance of the account that owns the API key. */
  async currentBalance(): Promise<number> {
    const body = await this.send<unknown>("/current-balance");
    const balance = Number.parseFloat(readResult(body, "Failed to get current balance"));
    if (!Number.isFinite(balance)) {
      throw new Error("Unexpected current-balance response");
    }
    return balance;
  }

  /** Transaction history of the account that owns the API key. */
  async transactionHistory(limit = 5, page = 1): Promise<TransactionHistory> {
    const body = await this.send<unknown>("/transactions", { query: { limit, page } });

    return assertSuccess<TransactionHistory>(body, "Failed to get transaction history");
  }
}
