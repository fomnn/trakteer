/**
 * Unofficial TypeScript client for [Trakteer](https://trakteer.id): the public
 * API, creator details, and payment (tip) creation.
 *
 * Not affiliated with Trakteer. The endpoints are unofficial and may change
 * without notice.
 *
 * @example
 * ```ts
 * import { TrakteerPublicApi, TrakteerUser } from "@fomnn/trakteer";
 *
 * const api = new TrakteerPublicApi({ apiKey: Deno.env.get("TRAKTEER_API_KEY")! });
 * console.log(await api.currentBalance());
 *
 * const creator = await TrakteerUser.getUserDetails("<creator-user-id>");
 * console.log(creator.username, creator.active_unit.data.price);
 * ```
 *
 * @module
 */

export { TrakteerHttpError } from "./http";
export type { FetchLike } from "./http";
export * from "./payment";
export * from "./public-api";
export type * from "./types";
export * from "./user";
