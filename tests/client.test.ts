import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SonoVault, SonoVaultError, paginate, verifyWebhookSignature } from "../src/index.js";

function mockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  let call = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(call++, responses.length - 1)];
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const track = {
  id: 123,
  title: "One More Time",
  artists: [{ id: 1, name: "Daft Punk" }],
  isrc: "GBDUW0000053",
  releases: [],
  duration: 320,
  genre: "House",
  subgenre: null,
};

describe("SonoVault", () => {
  it("requires an apiKey", () => {
    expect(() => new SonoVault({ apiKey: "" })).toThrow(/apiKey/);
  });

  it("sends the x-api-key header and builds query strings", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { results: [track], next_cursor: null } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const page = await sv.tracks.search({ artist: "Daft Punk", title: "One More Time", limit: 5 });

    expect(page.results[0].isrc).toBe("GBDUW0000053");
    expect(calls[0].url).toContain("https://api.sonovault.now/v1/tracks/search?");
    expect(calls[0].url).toContain("artist=Daft+Punk");
    expect(calls[0].url).toContain("limit=5");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("svk_test");
  });

  it("omits undefined query params", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { results: [], next_cursor: null } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await sv.tracks.search({ artist: "Daft Punk", title: "Around the World", cursor: undefined });

    expect(calls[0].url).not.toContain("cursor");
  });

  it("URL-encodes path params", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: track }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await sv.tracks.byIsrc("GBDUW0000053");

    expect(calls[0].url).toBe("https://api.sonovault.now/v1/tracks/isrc/GBDUW0000053");
  });

  it("POSTs JSON bodies for resolve", async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: { results: [], partial: false, processed: 0, credits_used: 0, credits_remaining: 1000, message: null } },
    ]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await sv.tracks.resolve({ input_type: "isrc", items: ["GBDUW0000053"] });

    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ input_type: "isrc", items: ["GBDUW0000053"] });
  });

  it("throws SonoVaultError with status on API errors", async () => {
    const { fetchImpl } = mockFetch([{ status: 403, body: { error: "Paid plan required" } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const err = await sv.tracks.browse({ genre: "House" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SonoVaultError);
    expect((err as SonoVaultError).status).toBe(403);
    expect((err as SonoVaultError).isForbidden).toBe(true);
    expect((err as SonoVaultError).message).toBe("Paid plan required");
  });

  it("retries 429 with Retry-After, then succeeds", async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 429, body: { error: "rate limited" }, headers: { "Retry-After": "0" } },
      { status: 200, body: track },
    ]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const result = await sv.tracks.get(123);

    expect(result.title).toBe("One More Time");
    expect(calls.length).toBe(2);
  });

  it("does not retry a 429 without Retry-After (quota exhaustion)", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 429, body: { error: "Monthly quota exceeded" } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await expect(sv.tracks.get(123)).rejects.toThrow(/quota/i);
    expect(calls.length).toBe(1);
  });

  it("attaches a timeout signal to requests", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { genres: [] } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl, timeoutMs: 5000 });

    await sv.genres.list();

    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the signal when timeoutMs is 0", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { genres: [] } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl, timeoutMs: 0 });

    await sv.genres.list();

    expect(calls[0].init.signal).toBeUndefined();
  });

  it("supports a custom baseUrl", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { genres: [] } }]);
    const sv = new SonoVault({ apiKey: "svk_test", baseUrl: "http://localhost:3000/", fetch: fetchImpl });

    await sv.genres.list();

    expect(calls[0].url).toBe("http://localhost:3000/v1/genres");
  });

  it("streams.live parses SSE frames into events", async () => {
    const frames =
      'data: {"id":"e1","type":"stream.play.started","created":1,"data":{"stream_id":"s1"}}\n\n' +
      ": keep-alive comment\n\n" +
      "event: stream.online\n" +
      'data: {"id":"e2","type":"stream.online","created":2,"data":{"stream_id":"s1"}}\n\n';
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames));
        controller.close();
      },
    });
    const fetchImpl = (async () =>
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })) as unknown as typeof fetch;
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const events = [];
    for await (const event of sv.streams.live()) events.push(event);

    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(events[1].type).toBe("stream.online");
  });

  it("streams.live throws SonoVaultError on a non-2xx response", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "nope" }), { status: 401 })) as unknown as typeof fetch;
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const iterate = async () => {
      for await (const _ of sv.streams.live()) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ status: 401 });
  });

  it("verifyWebhookSignature accepts a valid header and rejects tampering", () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1","type":"stream.play.started"}';
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    const header = `t=${t},v1=${v1}`;

    expect(verifyWebhookSignature({ secret, header, payload })).toBe(true);
    expect(verifyWebhookSignature({ secret, header, payload: Buffer.from(payload) })).toBe(true);
    expect(verifyWebhookSignature({ secret, header, payload: payload + "x" })).toBe(false);
    expect(verifyWebhookSignature({ secret: "whsec_other", header, payload })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: "garbage", payload })).toBe(false);
  });

  it("verifyWebhookSignature rejects stale timestamps unless tolerance is 0", () => {
    const secret = "whsec_test";
    const payload = "{}";
    const t = Math.floor(Date.now() / 1000) - 3600;
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    const header = `t=${t},v1=${v1}`;

    expect(verifyWebhookSignature({ secret, header, payload })).toBe(false);
    expect(verifyWebhookSignature({ secret, header, payload, toleranceSeconds: 0 })).toBe(true);
  });

  it("returns undefined for 204 responses", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 204 }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await sv.webhooks.delete("wh_1");

    expect(calls[0].init.method).toBe("DELETE");
  });
});

describe("user agent", () => {
  it("sends a sonovault-js User-Agent header", async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { genres: [] } }]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    await sv.genres.list();

    expect((calls[0].init.headers as Record<string, string>)["User-Agent"]).toMatch(/^sonovault-js\/\d+\.\d+\.\d+$/);
  });
});

describe("paginate", () => {
  it("walks all pages and yields every item", async () => {
    const { fetchImpl } = mockFetch([
      { status: 200, body: { results: [{ id: 1 }, { id: 2 }], next_cursor: "c1" } },
      { status: 200, body: { results: [{ id: 3 }], next_cursor: null } },
    ]);
    const sv = new SonoVault({ apiKey: "svk_test", fetch: fetchImpl });

    const items = [];
    for await (const item of paginate((cursor) => sv.suggestions.list({ cursor }))) {
      items.push(item);
    }

    expect(items.map((i) => (i as { id: number }).id)).toEqual([1, 2, 3]);
  });
});
