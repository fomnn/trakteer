import { decodeHTML } from "entities";
import { request, type FetchLike } from "./http";

interface CheckoutPage {
  props?: {
    payload?: {
      data?: {
        qrString?: unknown;
      };
    };
  };
}

interface CheckoutOptions {
  fetch?: FetchLike;
}

/**
 * Reads the raw QRIS payload from a Trakteer-hosted checkout page.
 *
 * The page is an Inertia app that embeds its props as JSON in `data-page`.
 * This is internal markup rather than a public API, so the result is optional:
 * callers should fall back to the checkout URL when it cannot be read.
 */
export async function readQrString(
  url: URL,
  options: CheckoutOptions = {},
): Promise<string | undefined> {
  // Only Trakteer-hosted checkout pages embed the payload (Snap pages do not).
  if (url.hostname !== "trakteer.id" && !url.hostname.endsWith(".trakteer.id")) {
    return undefined;
  }

  const { body } = await request(url.toString(), {
    fetch: options.fetch,
    headers: { Accept: "text/html" },
  });

  const raw = /data-page="([^"]*)"/.exec(body)?.[1];
  if (!raw) {
    return undefined;
  }

  const page = JSON.parse(decodeHTML(raw)) as CheckoutPage;
  const qrString = page.props?.payload?.data?.qrString;
  return typeof qrString === "string" && qrString.length > 0 ? qrString : undefined;
}
