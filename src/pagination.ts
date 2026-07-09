import type { Page } from "./types.js";

/**
 * Iterate every item across all pages of a cursor-paginated endpoint.
 *
 * ```ts
 * import { paginate } from "sonovault";
 *
 * for await (const release of paginate((cursor) => sv.artists.releases(42, { cursor }))) {
 *   console.log(release.title);
 * }
 * ```
 */
export async function* paginate<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    for (const item of page.results) yield item;
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
}
