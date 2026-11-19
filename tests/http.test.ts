import { expect, test } from "vitest";
import { TrakteerBlockedError, TrakteerHttpError, request } from "../src/http";

const BLOCK_PAGE = `<!DOCTYPE html>
<html lang="en-US">
<head><title>Attention Required! | Cloudflare</title></head>
<body>
  <div id="cf-error-details">
    <h1>Sorry, you have been blocked</h1>
    <span>Cloudflare Ray ID: <strong class="font-semibold">a5d16b0b5b19a110</strong></span>
  </div>
</body>
</html>`;

test("identifies itself with a User-Agent", async () => {
  let headers: Headers | undefined;
  await request("https://example.test/page", {
    fetch: async (_input, init) => {
      headers = new Headers(init?.headers);
      return new Response("ok");
    },
  });

  expect(headers?.get("user-agent")).toMatch(/trakteer/);
});

test("keeps a caller supplied User-Agent", async () => {
  let headers: Headers | undefined;
  await request("https://example.test/page", {
    fetch: async (_input, init) => {
      headers = new Headers(init?.headers);
      return new Response("ok");
    },
    headers: { "User-Agent": "custom-agent" },
  });

  expect(headers?.get("user-agent")).toBe("custom-agent");
});

test("throws TrakteerBlockedError with the Ray ID on a WAF block", async () => {
  const error = await request("https://trakteer.id/example", {
    fetch: async () => new Response(BLOCK_PAGE, { status: 403 }),
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(TrakteerBlockedError);
  expect(error).toBeInstanceOf(TrakteerHttpError);
  expect((error as TrakteerBlockedError).status).toBe(403);
  expect((error as TrakteerBlockedError).url).toBe("https://trakteer.id/example");
  expect((error as TrakteerBlockedError).rayId).toBe("a5d16b0b5b19a110");
});

test("keeps other 403 responses as TrakteerHttpError", async () => {
  const error = await request("https://api.trakteer.id/v2/fe/payment", {
    fetch: async () => new Response('{"message":"Invalid CSRF token"}', { status: 403 }),
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(TrakteerHttpError);
  expect(error).not.toBeInstanceOf(TrakteerBlockedError);
  expect((error as TrakteerHttpError).message).toBe("Invalid CSRF token");
});
