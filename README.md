# @fomnn/trakteer

Unofficial TypeScript client for [Trakteer](https://trakteer.id): public API,
creator details, and payment (tip) creation.

> Not affiliated with Trakteer. These endpoints are unofficial and may change
> without notice.

## Requirements

A runtime with `fetch` and `AbortSignal.any` (Node.js 20.3+, Deno, or Bun).

## Install

```bash
npx jsr add @fomnn/trakteer
```

```bash
pnpm dlx jsr add @fomnn/trakteer
```

```bash
deno add jsr:@fomnn/trakteer
```

## Usage

### Public API

Uses the official API and an API key from
<https://trakteer.id/manage/api-trakteer>.

```ts
import { TrakteerPublicApi } from "@fomnn/trakteer";

const api = new TrakteerPublicApi({ apiKey: process.env.TRAKTEER_API_KEY! });

const given = await api.quantityGiven("supporter@example.com");
const balance = await api.currentBalance();
const supports = await api.supportHistory(10, 1);
const transactions = await api.transactionHistory(5, 1);
```

### Creator details

```ts
import { TrakteerUser } from "@fomnn/trakteer";

const creator = await TrakteerUser.getUserDetails("<creator-user-id>");
console.log(creator.username, creator.active_unit.data.price);
```

`getUserDetails` takes the creator *user id*, not the page slug.
`TrakteerUser.getUserId(pageSlug)` still exists but is deprecated: Trakteer
patched the markup it scraped.

### Create a payment

`amount` is the number of units, not rupiah. The total (units × unit price plus
fees) is calculated by Trakteer.

```ts
import { TrakteerPayment } from "@fomnn/trakteer";

const methods = await TrakteerPayment.getPaymentMethods();
// e.g. "qris", "gopay", "ovo", "linkaja", "jenius", ...

const { url, qrString } = await TrakteerPayment.createPayment(
  "<creator-user-id>",
  "qris",
  1,
  {
    display_name: "Someone",
    support_message: "Keep it up!",
  },
);

console.log(url.href); // checkout page
console.log(qrString); // raw QRIS payload, when available
```

Creating a payment only creates a pending order; no money moves until the
supporter pays on the checkout page.

`getTotalAmount` previews the amount to pay, with `amount` in rupiah:

```ts
const total = await TrakteerPayment.getTotalAmount("qris", 10_000);
console.log(total.total_price);
```

### Errors

Failures are thrown as `Error` (or `TrakteerHttpError` for non-2xx responses)
instead of being returned as values.

```ts
import { TrakteerHttpError, TrakteerPayment } from "@fomnn/trakteer";

try {
  await TrakteerPayment.getPaymentMethods();
} catch (error) {
  if (error instanceof TrakteerHttpError) {
    console.error(error.status, error.body);
  }
}
```

### Custom fetch

Every call that hits the network accepts a `fetch` override, which is useful for
egress proxies or custom agents.

```ts
const options = { fetch: myFetch };

await TrakteerUser.getUserDetails("<creator-user-id>", options);
await TrakteerPayment.getPaymentMethods(options);
```

## API

### `TrakteerPublicApi`

| Method | Description |
| --- | --- |
| `quantityGiven(email)` | Units a supporter gave in the last 30 days. |
| `supportHistory(limit = 10, page = 1)` | Support history of the API key owner. |
| `currentBalance()` | Current balance of the API key owner. |
| `transactionHistory(limit = 5, page = 1)` | Transaction history of the API key owner. |

Options: `apiKey` (required), `fetch`, `userAgent`.

### `TrakteerUser`

| Method | Description |
| --- | --- |
| `getUserDetails(userId, options?)` | Creator summary, including the active unit. |
| `getUserId(pageId, options?)` | Deprecated. Resolves a page slug to a user id. |

### `TrakteerPayment`

| Method | Description |
| --- | --- |
| `getPaymentMethods(options?)` | Available methods, keyed by method id. |
| `getTotalAmount(method, amount, isPaymentFeeBySupporter = true, options?)` | Total for an amount in rupiah. |
| `createPayment(creatorId, method, amount, config?, options?)` | Creates a tip; returns `{ url, qrString? }`. |
| `generateNewToken(options?)` | Low-level CSRF token fetch. |

`createPayment` config: `display_name`, `guest_email`, `support_message`,
`is_anonym`, `is_private`, `is_showing_email`, `ovo_phone`, `linkaja_phone`,
`cashtag`. Phone fields must start with `08`.

Payment options: `fetch`, `tokenPage` (creator slug used to obtain the CSRF
token, defaults to `"BbayuGt"`).

## Caching

Creator and payment-method responses are cached process-wide for 60 seconds;
the anonymous CSRF token and cookie for one hour. Cached calls are
single-flight, and the cache is not configurable.

## Development

```bash
pnpm install
pnpm test --run
pnpm typecheck
pnpm lint
pnpm format:check
```

There is no build step: JSR publishes the TypeScript source directly
(`jsr.jsonc`).

```bash
pnpm release       # bump version
pnpm publish:jsr   # publish to JSR
```

## License

MIT
