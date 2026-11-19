/**
 * Creator details from the Trakteer web API.
 *
 * @module
 */

import { cached } from "./cache";
import { TrakteerHttpError, request, requestJson, type FetchLike } from "./http";
import { expect, userSummarySchema } from "./schemas";
import type { UserSummary } from "./types";

const CACHE_TTL = 60_000;

/** Options bag for the {@link TrakteerUser} methods. */
export interface UserApiOptions {
  /** Override fetch, e.g. to route requests through an egress proxy. */
  fetch?: FetchLike;
}

/**
 * Creator details. Responses are cached process-wide for 60 seconds.
 *
 * @example
 * ```ts
 * import { TrakteerUser } from "@fomnn/trakteer";
 *
 * const creator = await TrakteerUser.getUserDetails("<creator-user-id>");
 * console.log(creator.username, creator.active_unit.data.price);
 * ```
 */
export class TrakteerUser {
  /**
   * Gets the user id from a page slug.
   *
   * @param pageId Page slug, i.e. the part after `trakteer.id/`.
   * @param options Transport options.
   * @returns The creator's user id.
   * @deprecated Trakteer has patched the markup this scraped; kept for parity
   * with the upstream library. Prefer supplying the user id directly.
   */
  static getUserId(pageId: string, options: UserApiOptions = {}): Promise<string> {
    return cached(`userId:${pageId}`, CACHE_TTL, async () => {
      let body: string;
      try {
        ({ body } = await request(`https://trakteer.id/${encodeURIComponent(pageId)}`, {
          fetch: options.fetch,
          headers: { Accept: "text/html" },
        }));
      } catch (error) {
        throw new Error(`Failed to load Trakteer page "${pageId}"`, { cause: error });
      }

      const match = /(?<=creator-id=")(.*?)(?=")/.exec(body);
      if (!match) {
        throw new Error(`User not found, or "${pageId}" is not an active creator page`);
      }
      return match[0];
    });
  }

  /**
   * Gets creator details, including the id and price of the active unit.
   *
   * @param userId Creator *user* id, not the page slug.
   * @param options Transport options.
   * @returns The creator summary.
   * @throws {Error} When the id is invalid or the response shape is unexpected.
   */
  static getUserDetails(userId: string, options: UserApiOptions = {}): Promise<UserSummary> {
    return cached(`userDetails:${userId}`, CACHE_TTL, async () => {
      const url = `https://api.trakteer.id/v2/fe/creator/${encodeURIComponent(userId)}/summary`;

      try {
        const body = await requestJson<{ data?: UserSummary }>(url, {
          fetch: options.fetch,
        });
        if (!body.data) {
          throw new Error(`Invalid user details response for "${userId}"`);
        }
        return expect<UserSummary>(userSummarySchema, body.data, "user details");
      } catch (error) {
        if (error instanceof TrakteerHttpError && error.status === 422) {
          throw new Error(`Invalid user id: ${JSON.stringify(userId)}`, { cause: error });
        }
        throw error;
      }
    });
  }
}
