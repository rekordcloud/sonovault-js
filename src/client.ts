import { SonoVaultError } from "./error.js";
import { VERSION } from "./version.js";
import type {
  Artist,
  Genre,
  IdentifyRequest,
  IdentifyResponse,
  IswcLookupResponse,
  Label,
  Page,
  PlatformLinksResponse,
  Release,
  ResolveRequest,
  ResolveResponse,
  Stream,
  StreamEvent,
  Track,
  Webhook,
} from "./types.js";

export interface SonoVaultOptions {
  /** Your API key — get a free one at https://sonovault.now (1,000 requests/month). */
  apiKey: string;
  /** Override the API base URL. Defaults to https://api.sonovault.now. */
  baseUrl?: string;
  /** Retries on 429/5xx responses. Default 2; set 0 to disable. */
  maxRetries?: number;
  /**
   * Per-request timeout in milliseconds. Default 30000; set 0 to disable.
   * Does not apply to `streams.live()`, which stays open indefinitely.
   */
  timeoutMs?: number;
  /** Custom fetch implementation (for testing or polyfills). */
  fetch?: typeof globalThis.fetch;
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: string;
  query?: Query;
  json?: unknown;
  /** Raw request body (e.g. audio bytes) with its content type. */
  raw?: { body: BodyInit; contentType: string };
}

export class SonoVault {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: SonoVaultOptions) {
    if (!options?.apiKey) throw new Error("SonoVault: apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.sonovault.now").replace(/\/$/, "");
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "User-Agent": `sonovault-js/${VERSION}`,
    };
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.raw) {
      headers["Content-Type"] = opts.raw.contentType;
      body = opts.raw.body;
    }

    let lastError: SonoVaultError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        const signal = this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined;
        res = await this.fetchImpl(url, { method: opts.method ?? "GET", headers, body, signal });
      } catch (err) {
        const e = err as Error;
        const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
        lastError = new SonoVaultError(
          timedOut ? `Request timed out after ${this.timeoutMs}ms` : `Network error: ${e.message}`,
          0,
        );
        continue;
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const errBody = await res.json().catch(() => undefined);
      const message =
        (errBody as { error?: string; message?: string } | undefined)?.error ??
        (errBody as { message?: string } | undefined)?.message ??
        `HTTP ${res.status}`;
      lastError = new SonoVaultError(message, res.status, errBody);

      // Retry only transient failures. A 429 with Retry-After is a rate limit
      // (retryable); a 429 without one is usually quota exhaustion (not).
      const retryAfter = res.headers.get("retry-after");
      const retryable = res.status >= 500 || (res.status === 429 && retryAfter !== null);
      if (!retryable || attempt === this.maxRetries) throw lastError;
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw lastError ?? new SonoVaultError("Request failed", 0);
  }

  /** Connect to an SSE endpoint and yield one parsed JSON event per `data:` frame. */
  private async *sse<T>(path: string, signal?: AbortSignal): AsyncGenerator<T> {
    const url = new URL(this.baseUrl + path);
    const res = await this.fetchImpl(url, {
      headers: {
        "x-api-key": this.apiKey,
        "User-Agent": `sonovault-js/${VERSION}`,
        Accept: "text/event-stream",
      },
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      const message =
        (body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
      throw new SonoVaultError(message, res.status, body);
    }
    if (!res.body) throw new SonoVaultError("SSE response has no body", res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let dataLines: string[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          if (line === "") {
            // Blank line ends the frame.
            if (dataLines.length > 0) {
              const data = dataLines.join("\n");
              dataLines = [];
              try {
                yield JSON.parse(data) as T;
              } catch {
                // Skip non-JSON frames (keep-alives).
              }
            }
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
          // event:, id:, retry:, and comment lines are ignored.
        }
      }
    } finally {
      reader.releaseLock();
      res.body.cancel().catch(() => {});
    }
  }

  readonly tracks = {
    /** Search by artist + title (both required — there is no free-text query). */
    search: (params: { artist: string; title: string; limit?: number; cursor?: string }) =>
      this.request<Page<Track>>("/v1/tracks/search", { query: params }),

    /** Fetch a track by its SonoVault ID. */
    get: (id: number) => this.request<Track>(`/v1/tracks/${id}`),

    /** Look up a track by any of its ISRCs. */
    byIsrc: (isrc: string) => this.request<Track>(`/v1/tracks/isrc/${encodeURIComponent(isrc)}`),

    /** Recording → composition: the ISWC(s) behind a recording, by ISRC or track ID. */
    iswc: (params: { isrc?: string; id?: number }) =>
      this.request<IswcLookupResponse>("/v1/tracks/iswc", { query: params }),

    /** Composition → recordings: every recording of a work, by ISWC. */
    byIswc: (iswc: string, params: { limit?: number } = {}) =>
      this.request<{ iswc: string; results: Track[] }>(
        `/v1/tracks/iswc/${encodeURIComponent(iswc)}`,
        { query: params },
      ),

    /** Cross-platform IDs + deep links for a track, resolved from any platform's ID or an ISRC. */
    links: (params: {
      id?: number;
      isrc?: string;
      spotify_id?: string;
      beatport_id?: string;
      discogs_id?: string;
      musicbrainz_id?: string;
      applemusic_id?: string;
      tidal_id?: string;
      youtube_id?: string;
    }) => this.request<PlatformLinksResponse>("/v1/tracks/links", { query: params }),

    /** Resolve up to 100 track names, ISRCs, or platform IDs in one request. */
    resolve: (body: ResolveRequest) =>
      this.request<ResolveResponse>("/v1/tracks/resolve", { method: "POST", json: body }),

    /** Identify a track from a Chromaprint fingerprint (`fpcalc -raw`). Paid tiers. */
    identify: (body: IdentifyRequest) =>
      this.request<IdentifyResponse>("/v1/tracks/identify", { method: "POST", json: body }),

    /**
     * Identify a track from raw audio bytes (any ffmpeg-decodable format).
     * Send the whole track when you can — the matching section is often mid-track.
     * Paid tiers; costs 10 + ceil(MB) credits.
     */
    identifyAudio: (
      audio: ArrayBuffer | Uint8Array | Blob,
      params: { length?: number; top_n?: number } = {},
    ) =>
      this.request<IdentifyResponse>("/v1/tracks/identify", {
        method: "POST",
        query: params,
        raw: { body: audio as BodyInit, contentType: "application/octet-stream" },
      }),

    /** Browse the catalog by label, artist, genre, or year. Paid tiers. */
    browse: (params: {
      labelId?: number;
      artistId?: number;
      genre?: string;
      genreId?: number;
      year?: number;
      randomize?: boolean;
      limit?: number;
      cursor?: string;
    }) => this.request<Page<Track>>("/v1/tracks/browse", { query: params }),
  };

  readonly artists = {
    search: (params: { name: string; limit?: number; cursor?: string }) =>
      this.request<Page<Artist>>("/v1/artists/search", { query: params }),
    get: (id: number) => this.request<Artist>(`/v1/artists/${id}`),
    releases: (id: number, params: { limit?: number; cursor?: string } = {}) =>
      this.request<Page<Release>>(`/v1/artists/${id}/releases`, { query: params }),
  };

  readonly labels = {
    search: (params: { name: string; limit?: number; cursor?: string }) =>
      this.request<Page<Label>>("/v1/labels/search", { query: params }),
    get: (id: number) => this.request<Label>(`/v1/labels/${id}`),
    releases: (id: number, params: { limit?: number; cursor?: string } = {}) =>
      this.request<Page<Release>>(`/v1/labels/${id}/releases`, { query: params }),
    artists: (id: number, params: { limit?: number; cursor?: string } = {}) =>
      this.request<Page<Artist>>(`/v1/labels/${id}/artists`, { query: params }),
  };

  readonly releases = {
    search: (params: { title: string; artist?: string; limit?: number; cursor?: string }) =>
      this.request<Page<Release>>("/v1/releases/search", { query: params }),
    get: (id: number) => this.request<Release>(`/v1/releases/${id}`),
    /** Newly released albums (GET /v1/releases/new). Paid tiers. */
    latest: (params: { limit?: number; cursor?: string } = {}) =>
      this.request<Page<Release>>("/v1/releases/new", { query: params }),
  };

  readonly genres = {
    /** The canonical genre/subgenre hierarchy. */
    list: () => this.request<{ genres: Genre[] }>("/v1/genres"),
  };

  readonly suggestions = {
    /** Suggest a metadata correction for a track. Paid tiers. */
    submit: (trackId: number, body: Record<string, unknown>) =>
      this.request<Record<string, unknown>>(`/v1/tracks/${trackId}/suggestions`, {
        method: "POST",
        json: body,
      }),
    list: (params: { limit?: number; cursor?: string } = {}) =>
      this.request<Page<Record<string, unknown>>>("/v1/suggestions", { query: params }),
  };

  readonly streams = {
    /** Start monitoring an Icecast/Shoutcast stream. Paid tiers. */
    create: (body: Record<string, unknown>) =>
      this.request<Stream>("/v1/streams", { method: "POST", json: body }),
    list: () => this.request<{ streams: Stream[] }>("/v1/streams"),
    get: (id: string) => this.request<Stream>(`/v1/streams/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      this.request<Stream>(`/v1/streams/${id}`, { method: "PATCH", json: body }),
    history: (id: string, params: { since?: string } = {}) =>
      this.request<Record<string, unknown>>(`/v1/streams/${id}/history`, { query: params }),
    report: (params: { from: string; until: string; stream_id?: string }) =>
      this.request<Record<string, unknown>>("/v1/streams/report", { query: params }),
    /**
     * Real-time play events for your monitored streams, as an async iterator
     * over Server-Sent Events. Runs until you `break` or abort the signal.
     *
     * ```ts
     * for await (const event of sv.streams.live()) {
     *   console.log(event.data.track?.title);
     * }
     * ```
     */
    live: (options: { signal?: AbortSignal } = {}) =>
      this.sse<StreamEvent>("/v1/streams/live", options.signal),
    /** Stop monitoring a stream. */
    stop: (id: string) => this.request<void>(`/v1/streams/${id}`, { method: "DELETE" }),
  };

  readonly webhooks = {
    /** Register an endpoint for stream events. The response includes `secret` once — store it. */
    create: (body: { url: string; event_types?: string[]; description?: string }) =>
      this.request<Webhook>("/v1/webhooks", { method: "POST", json: body }),
    list: () => this.request<{ webhooks: Webhook[] }>("/v1/webhooks"),
    get: (id: string) => this.request<Webhook>(`/v1/webhooks/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      this.request<Webhook>(`/v1/webhooks/${id}`, { method: "PATCH", json: body }),
    delete: (id: string) => this.request<void>(`/v1/webhooks/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      this.request<Record<string, unknown>>(`/v1/webhooks/${id}/test`, { method: "POST" }),
    deliveries: (id: string) =>
      this.request<Record<string, unknown>>(`/v1/webhooks/${id}/deliveries`),
  };
}
