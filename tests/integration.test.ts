/**
 * Live integration tests against the production API.
 * Skipped unless SONOVAULT_API_KEY is set:
 *
 *   SONOVAULT_API_KEY=svk_live_… npm test
 */
import { describe, expect, it } from "vitest";
import { SonoVault } from "../src/index.js";

const apiKey = process.env.SONOVAULT_API_KEY;

describe.skipIf(!apiKey)("live API", () => {
  // The describe body is collected even when skipped, so fall back to a
  // dummy key — no test runs with it.
  const sv = new SonoVault({ apiKey: apiKey ?? "svk_skipped" });

  it("searches by artist + title", async () => {
    const { results } = await sv.tracks.search({ artist: "Daft Punk", title: "One More Time", limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title.toLowerCase()).toContain("one more time");
    expect(results[0].artists.some((a) => a.name === "Daft Punk")).toBe(true);
    expect(results[0].isrc).toBeTruthy();
  });

  it("looks a track up by ISRC and fetches it by id", async () => {
    const { results } = await sv.tracks.search({ artist: "Daft Punk", title: "Around the World", limit: 1 });
    const found = results[0];
    const byIsrc = await sv.tracks.byIsrc(found.isrc!);
    expect(byIsrc.id).toBe(found.id);
    const byId = await sv.tracks.get(found.id);
    expect(byId.title).toBe(found.title);
  });

  it("resolves cross-platform links from an ISRC", async () => {
    const { results } = await sv.tracks.search({ artist: "Daft Punk", title: "One More Time", limit: 1 });
    const { links } = await sv.tracks.links({ isrc: results[0].isrc! });
    expect(links.length).toBeGreaterThan(1);
    expect(links.map((l) => l.source)).toContain("spotify");
  });

  it("maps a recording to its ISWC", async () => {
    const { results } = await sv.tracks.search({ artist: "Daft Punk", title: "One More Time", limit: 1 });
    const work = await sv.tracks.iswc({ isrc: results[0].isrc! });
    expect(Array.isArray(work.iswcs)).toBe(true);
  });

  it("bulk-resolves ISRCs", async () => {
    const { results } = await sv.tracks.search({ artist: "Daft Punk", title: "Harder, Better, Faster, Stronger", limit: 1 });
    const batch = await sv.tracks.resolve({ input_type: "isrc", items: [results[0].isrc!] });
    expect(batch.results[0].status).toBe("matched");
    expect(batch.results[0].track?.id).toBe(results[0].id);
  });

  it("lists genres", async () => {
    const { genres } = await sv.genres.list();
    expect(genres.length).toBeGreaterThan(10);
  });

  it("rejects a bad key with a 401", async () => {
    const bad = new SonoVault({ apiKey: "svk_live_invalid" });
    const err = await bad.genres.list().catch((e: unknown) => e);
    expect((err as { status?: number }).status).toBe(401);
  });
});
