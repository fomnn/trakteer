/**
 * Payment (tip) creation through the Trakteer Payment API.
 *
 * Creating a payment only creates a pending order and returns a checkout URL;
 * no money moves until the supporter pays there.
 *
 * @module
 */

import { parseSetCookie } from "set-cookie-parser";
import { cached, invalidate } from "./cache";
import { readQrString } from "./checkout";
import {
  TrakteerBlockedError,
  TrakteerHttpError,
  request,
  requestJson,
  type FetchLike,
} from "./http";
import { checkoutResponseSchema, expect, paymentTotalSchema } from "./schemas";
import type { CreatePaymentConfig, PaymentMethod, PaymentTotal } from "./types";
import { TrakteerUser } from "./user";

const API_URL = "https://api.trakteer.id/v2/fe";
const WEB_URL = "https://trakteer.id";
const MIDTRANS_SNAP_URL = "https://app.midtrans.com/snap";

/**
 * Any public creator page works here: the CSRF token is bound to the
 * anonymous session cookie, not to the creator being paid.
 */
const DEFAULT_TOKEN_PAGE = "BbayuGt";

const CACHE_TTL = 60_000;
const TOKEN_TTL = 60 * 60 * 1000;

/** Statuses that usually mean the cached CSRF token or cookie went stale. */
const CSRF_FAILURE_STATUSES = new Set([403, 419]);

/** Options bag for the {@link TrakteerPayment} methods. */
export interface PaymentApiOptions {
  /** Override fetch, e.g. to route requests through an egress proxy. */
  fetch?: FetchLike;
  /**
   * Public creator page used to obtain an anonymous CSRF token. Override this
   * if the default page is gone.
   */
  tokenPage?: string;
}

/** Anonymous session credentials used for the payment form. */
export interface CsrfToken {
  /** Session cookies, already joined into a `Cookie` header value. */
  cookie: string;
  /** Value for the `X-Csrf-Token` header. */
  csrf: string;
}

/** Result of {@link TrakteerPayment.createPayment}. */
export interface CreatePaymentResult {
  /** Raw QRIS payload, when the payment method renders a QR code. */
  qrString?: string;
  /** Trakteer checkout page; open it to show the QR/VA/deeplink. */
  url: URL;
}

interface CheckoutResponse {
  checkout_url?: string;
  order_id?: string;
}

interface TipPayload {
  creator_id: string;
  display_name: string;
  form: "create-tip";
  guest_email: string;
  is_anonym: "on" | "off";
  is_private: "on" | "off";
  is_remember_next: "off";
  is_showing_email: "on" | "off";
  payment_method: string;
  quantity: number;
  support_message: string;
  times: "once";
  unit_id: string;
}

interface XenditTipPayload extends TipPayload {
  cashtag?: string;
  linkaja_phone?: `08${string}`;
  ovo_phone?: `08${string}`;
}

interface TipPayloadInput {
  config: CreatePaymentConfig;
  creatorId: string;
  paymentMethod: string;
  quantity: number;
  unitId: string;
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive finite number, received ${amount}`);
  }
}

function csrfCacheKey(options: PaymentApiOptions): string {
  return `csrfToken:${options.tokenPage ?? DEFAULT_TOKEN_PAGE}`;
}

function csrfHeaders(token: CsrfToken): Record<string, string> {
  return { Cookie: token.cookie, "X-Csrf-Token": token.csrf };
}

function isCsrfFailure(error: unknown): boolean {
  // A Cloudflare block is a firewall decision; refreshing the token cannot help.
  return (
    error instanceof TrakteerHttpError &&
    !(error instanceof TrakteerBlockedError) &&
    CSRF_FAILURE_STATUSES.has(error.status)
  );
}

function onOff(value: boolean | undefined): "on" | "off" {
  return value ? "on" : "off";
}

/** Unit price is serialized as a float string, so `parseInt` would truncate it. */
function parseUnitPrice(value: string): number {
  const price = Number.parseFloat(value);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid unit price from Trakteer: ${JSON.stringify(value)}`);
  }
  return price;
}

/** The `create-tip` form shared by the xendit and midtrans gateways. */
function tipPayload(input: TipPayloadInput): TipPayload {
  const { config, creatorId, paymentMethod, quantity, unitId } = input;
  return {
    creator_id: creatorId,
    display_name: config.display_name ?? "Seseorang",
    form: "create-tip",
    guest_email: config.guest_email ?? "notexist@not.ex.ist",
    is_anonym: onOff(config.is_anonym),
    is_private: onOff(config.is_private),
    is_remember_next: "off",
    is_showing_email: onOff(config.is_showing_email),
    payment_method: paymentMethod,
    quantity,
    support_message: config.support_message ?? "",
    times: "once",
    unit_id: unitId,
  };
}

/** Both gateways answer with a hosted checkout page (or just an order id). */
function checkoutUrl(data: unknown): URL {
  const response = expect<CheckoutResponse>(checkoutResponseSchema, data, "checkout");
  if (response.checkout_url) {
    return new URL(response.checkout_url);
  }
  if (response.order_id) {
    return new URL(`${WEB_URL}/payment-status/${encodeURIComponent(response.order_id)}`);
  }
  throw new Error(`Failed to create payment: ${JSON.stringify(data)}`);
}

/**
 * Payment API. Upstream returns `Error` values in some paths and throws in
 * others; this port throws consistently.
 *
 * @example
 * ```ts
 * import { TrakteerPayment } from "@fomnn/trakteer";
 *
 * const { url, qrString } = await TrakteerPayment.createPayment(
 *   "<creator-user-id>",
 *   "qris",
 *   1,
 *   { display_name: "Someone", support_message: "Keep it up!" },
 * );
 * ```
 */
export class TrakteerPayment {
  /**
   * All payment methods, keyed by method id (e.g. `"qris"`).
   *
   * @param options Transport options.
   * @returns The available methods, including disabled ones.
   */
  static getPaymentMethods(
    options: PaymentApiOptions = {},
  ): Promise<Record<string, PaymentMethod>> {
    return cached("paymentMethods", CACHE_TTL, async () => {
      const body = await requestJson<{
        data?: Record<string, PaymentMethod>;
        message?: string;
      }>(`${API_URL}/payment-methods`, { fetch: options.fetch });

      if (!body.data) {
        throw new Error(body.message ?? "Invalid payment methods response");
      }
      return body.data;
    });
  }

  /**
   * Total amount to pay, including fees.
   *
   * @param paymentMethod Payment method id, see {@link TrakteerPayment.getPaymentMethods}.
   * @param amount Price in rupiah.
   * @param isPaymentFeeBySupporter Charge the payment fee to the supporter.
   * @param options Transport options.
   * @returns The price breakdown for this method and amount.
   */
  static async getTotalAmount(
    paymentMethod: string,
    amount: number,
    isPaymentFeeBySupporter = true,
    options: PaymentApiOptions = {},
  ): Promise<PaymentTotal> {
    assertPositiveAmount(amount);

    const body = await requestJson<{
      data?: PaymentTotal;
      message?: string;
      status?: "success" | "error";
    }>(`${API_URL}/payment/total`, {
      fetch: options.fetch,
      json: {
        is_payment_fee_by_supporter: isPaymentFeeBySupporter,
        payment_method: paymentMethod,
        price: amount,
      },
      method: "POST",
    });

    if (body.status === "error" || !body.data) {
      throw new Error(body.message ?? "Failed to calculate payment total");
    }
    return expect<PaymentTotal>(paymentTotalSchema, body.data, "payment total");
  }

  /**
   * Fetches a CSRF token and the anonymous session cookie that goes with it.
   *
   * The result is cached for one hour and is refreshed automatically when a
   * payment request is rejected with 403 or 419.
   *
   * @param options Transport options.
   * @returns The token and its cookies.
   */
  static generateNewToken(options: PaymentApiOptions = {}): Promise<CsrfToken> {
    const tokenPage = options.tokenPage ?? DEFAULT_TOKEN_PAGE;

    return cached(csrfCacheKey(options), TOKEN_TTL, async () => {
      const { body, response } = await request(`${WEB_URL}/${encodeURIComponent(tokenPage)}`, {
        fetch: options.fetch,
        headers: { Accept: "text/html" },
      });

      const csrf = /(?<="csrf-token" content=")(.*?)(?=")/.exec(body)?.[1];
      if (!csrf) {
        throw new Error("Failed to get csrf token");
      }

      const cookies = parseSetCookie(response.headers.getSetCookie(), {
        // Keep the value byte-for-byte; decoding would change some tokens.
        decodeValues: false,
      });
      if (cookies.length === 0) {
        throw new Error("Failed to get cookie");
      }

      return {
        cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
        csrf,
      };
    });
  }

  /**
   * Creates a payment (tip) for a creator.
   *
   * Returns the checkout URL plus the raw QRIS payload when the method renders
   * a QR code. Open the URL to pay; the order stays pending until paid or
   * expired, so no money moves on creation.
   *
   * @param creatorId Creator *user* id, not the page slug.
   * @param paymentMethod Payment method id, see {@link TrakteerPayment.getPaymentMethods}.
   * @param amount Amount in units (quantity), not rupiah.
   * @param config Supporter details, message and e-wallet numbers.
   * @param options Transport options.
   * @returns The checkout URL and, when available, the QRIS payload.
   * @throws {Error} When the method is unsupported, the amount is below the
   * minimum, or a required e-wallet field is missing.
   */
  static async createPayment(
    creatorId: string,
    paymentMethod: string,
    amount: number,
    config: CreatePaymentConfig = {},
    options: PaymentApiOptions = {},
  ): Promise<CreatePaymentResult> {
    assertPositiveAmount(amount);

    const paymentMethods = await TrakteerPayment.getPaymentMethods(options);
    const method = paymentMethods[paymentMethod];
    if (!method) {
      throw new Error("Invalid payment method");
    }

    const user = await TrakteerUser.getUserDetails(creatorId, {
      fetch: options.fetch,
    });
    const unitPrice = parseUnitPrice(user.active_unit.data.price);

    if (method.min_price != null && amount < method.min_price / unitPrice) {
      throw new Error(`Minimum donation for this method is Rp. ${method.min_price}`);
    }

    const payload = tipPayload({
      config,
      creatorId,
      paymentMethod,
      quantity: amount,
      unitId: user.active_unit.data.id,
    });

    let url: URL;
    switch (method.gateway) {
      case "xendit":
        url = await TrakteerPayment.payWithXendit(paymentMethod, payload, config, options);
        break;
      case "midtrans":
        url = await TrakteerPayment.payWithMidtrans(paymentMethod, payload, options);
        break;
      case "trakteer":
        throw new Error("Payment method not supported (requires login)");
      default:
        throw new Error("Payment method not supported");
    }

    // The order already exists at this point, so a failed scrape should not turn
    // it into an error; callers can still send the supporter to the checkout URL.
    const qrString = await readQrString(url, { fetch: options.fetch }).catch(() => undefined);

    return qrString ? { qrString, url } : { url };
  }

  /** Runs `send` with a CSRF token, refreshing it once when Trakteer rejects it. */
  private static async withCsrfRetry<T>(
    options: PaymentApiOptions,
    send: (token: CsrfToken) => Promise<T>,
  ): Promise<T> {
    let token = await TrakteerPayment.generateNewToken(options);
    try {
      return await send(token);
    } catch (error) {
      if (!isCsrfFailure(error)) {
        throw error;
      }
      invalidate(csrfCacheKey(options));
      token = await TrakteerPayment.generateNewToken(options);
      return send(token);
    }
  }

  /** POSTs a tip payload and parses the JSON response. */
  private static postTipJson<T>(
    url: string,
    payload: unknown,
    options: PaymentApiOptions,
  ): Promise<T> {
    return TrakteerPayment.withCsrfRetry(options, (token) =>
      requestJson<T>(url, {
        fetch: options.fetch,
        headers: csrfHeaders(token),
        json: payload,
        method: "POST",
      }),
    );
  }

  /**
   * POSTs a tip payload and returns the raw body. Some Midtrans methods still
   * answer with a bare Snap token instead of JSON.
   */
  private static postTipText(
    url: string,
    payload: unknown,
    options: PaymentApiOptions,
  ): Promise<string> {
    return TrakteerPayment.withCsrfRetry(options, async (token) => {
      const { body } = await request(url, {
        fetch: options.fetch,
        headers: csrfHeaders(token),
        json: payload,
        method: "POST",
      });
      return body.trim();
    });
  }

  private static async payWithXendit(
    paymentMethod: string,
    payload: TipPayload,
    config: CreatePaymentConfig,
    options: PaymentApiOptions,
  ): Promise<URL> {
    if (paymentMethod === "ovo" && !config.ovo_phone) {
      throw new Error("OVO phone number is required for OVO payment method");
    }
    if (paymentMethod === "linkaja" && !config.linkaja_phone) {
      throw new Error("LinkAja phone number is required for LinkAja payment method");
    }
    if (paymentMethod === "jenius" && !config.cashtag) {
      throw new Error("Cashtag is required for Jenius payment method");
    }

    const xenditPayload: XenditTipPayload = {
      ...payload,
      cashtag: config.cashtag,
      linkaja_phone: config.linkaja_phone,
      ovo_phone: config.ovo_phone,
    };

    let data: CheckoutResponse;
    try {
      data = await TrakteerPayment.postTipJson<CheckoutResponse>(
        `${WEB_URL}/pay/xendit/${paymentMethod}`,
        xenditPayload,
        options,
      );
    } catch (error) {
      if (error instanceof TrakteerHttpError && error.status === 500) {
        throw new Error(`Failed to create payment, check the minimum donation: ${error.body}`, {
          cause: error,
        });
      }
      if (
        error instanceof TrakteerHttpError &&
        error.status === 401 &&
        paymentMethod === "jenius"
      ) {
        throw new Error("Cashtag is invalid", { cause: error });
      }
      throw error;
    }

    return checkoutUrl(data);
  }

  private static async payWithMidtrans(
    paymentMethod: string,
    payload: TipPayload,
    options: PaymentApiOptions,
  ): Promise<URL> {
    const body = await TrakteerPayment.postTipText(
      `${WEB_URL}/pay/midtrans/${paymentMethod}`,
      payload,
      options,
    );

    // QRIS and virtual accounts answer with a Trakteer-hosted checkout page.
    if (body.startsWith("{")) {
      return checkoutUrl(JSON.parse(body) as CheckoutResponse);
    }

    // Other methods (e.g. gopay) still answer with a bare Midtrans Snap token.
    // Send the supporter to Snap's hosted page instead of charging server-side.
    if (/^\S+$/.test(body)) {
      return new URL(`${MIDTRANS_SNAP_URL}/v4/redirection/${encodeURIComponent(body)}`);
    }

    throw new Error(`Failed to create payment: ${body.slice(0, 200)}`);
  }
}
