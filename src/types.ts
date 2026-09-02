/** An artist credit on a track. */
export interface TrackArtist {
  id: number;
  name: string;
  is_primary?: boolean;
  is_remixer?: boolean;
}

/** A release a track appears on, with its artist, label, and release date. */
export interface TrackRelease {
  id: number;
  title: string;
  artist: { id: number; name: string };
  label: { id: number; name: string } | null;
  release_date: string | null;
}

/**
 * The public track shape returned by search, lookups, and resolve.
 * Note: audio features (BPM, key, energy, …) are not exposed on the public API.
 */
export interface Track {
  id: number;
  title: string;
  releases: TrackRelease[];
  artists: TrackArtist[];
  isrc: string | null;
  duration: number | null;
  /** Canonical genres. Empty array when the track is unclassified. */
  genre: string[];
  /** Canonical subgenres. Empty array when none apply. */
  subgenre: string[];
}

/**
 * A track as embedded in a release, from `GET /v1/releases/:id`.
 *
 * Same as {@link Track} minus the `releases` array (the release is the object
 * you are already looking at), plus this track's position on that release.
 */
export interface ReleaseTrack {
  id: number;
  title: string;
  artists: TrackArtist[];
  isrc: string | null;
  duration: number | null;
  /** Canonical genres. Empty array when the track is unclassified. */
  genre: string[];
  /** Canonical subgenres. Empty array when none apply. */
  subgenre: string[];
  /** Disc the track sits on, counting from 1. Null when the position is unknown. */
  disc_number: number | null;
  /**
   * Position on this release, counting from 1 within its disc. A position
   * belongs to the pairing of track and release rather than to the track, so
   * the same recording can be track 6 on an album and track 2 on a
   * compilation. Null when the position is unknown.
   */
  track_number: number | null;
}

/** A cursor-paginated page. `next_cursor` is null on the last page. */
export interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

export interface Artist {
  id: number;
  name: string;
  /** Country of origin, in English. Null when unknown. */
  country?: string | null;
  /** Year the artist or group started, or birth year for a solo act. */
  formation_year?: number | null;
  /** Full ISO date, present only when day-level precision is known. */
  formation_date?: string | null;
  /** Platform to handle or URL. Which keys appear varies by artist. */
  social_links?: Record<string, string> | null;
  /** Wikidata entity ID, e.g. `Q185828`. Null when unmapped. */
  wikidata_id?: string | null;
  /** MusicBrainz artist MBID. Null when unmapped. */
  musicbrainz_id?: string | null;
  [key: string]: unknown;
}

export interface Label {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface Release {
  id: number;
  title: string;
  artist?: { id: number; name: string };
  label?: { id: number; name: string } | null;
  release_date?: string | null;
  /**
   * The tracklist, in playing order (disc, then track number), with any track
   * whose position is unknown last.
   */
  tracks?: ReleaseTrack[];
  [key: string]: unknown;
}

export interface Genre {
  id: number;
  name: string;
  /** Whether this is a top-level genre or a subgenre. */
  type: "main" | "subgenre";
  /** Name of the parent genre; null for a top-level genre. */
  parent: string | null;
  [key: string]: unknown;
}

/** A track's ID on an external platform, with a deep link. */
export interface PlatformLink {
  source: string;
  external_id: string;
  url: string | null;
}

export interface PlatformLinksResponse {
  track_id: number;
  title: string;
  /** One representative ISRC for the track; null when none is known. */
  isrc: string | null;
  links: PlatformLink[];
  [key: string]: unknown;
}

/** ISWC entries for a recording (one recording can carry several work codes). */
export interface IswcLookupResponse {
  sonovault_id?: number;
  isrc?: string;
  iswcs?: { iswc: string; title: string | null }[];
  [key: string]: unknown;
}

export type ResolveInputType =
  | "track_name"
  | "isrc"
  | "sonovault_id"
  | "spotify_id"
  | "applemusic_id"
  | "tidal_id"
  | "beatport_id"
  | "discogs_id"
  | "musicbrainz_id";

export interface ResolveRequest {
  input_type: ResolveInputType;
  /** 1–100 entries. `{ artist, title }` objects for `track_name`, strings otherwise. */
  items: (string | { artist: string; title: string })[];
}

export interface ResolveResult {
  input: string | { artist: string; title: string };
  status: "matched" | "not_found" | "skipped_no_credits";
  track: Track | null;
  links: PlatformLink[];
}

export interface ResolveResponse {
  results: ResolveResult[];
  partial: boolean;
  processed: number;
  credits_used: number;
  credits_remaining: number;
  message: string | null;
}

export interface IdentifyResult {
  id: number;
  title: string;
  artists: TrackArtist[];
  /** 0–1; higher means a more certain match. */
  confidence: number;
}

export interface IdentifyResponse {
  matched: boolean;
  results: IdentifyResult[];
  credits_charged: number;
  [key: string]: unknown;
}

export interface Stream {
  id: string;
  url: string;
  name: string | null;
  status: "active" | "stopped";
  detection_mode: "precise" | "balanced" | "broad";
  /** Whether we email you when this stream goes down and when it recovers. */
  outage_notifications: boolean;
  created_at: string;
  stopped_at: string | null;
  [key: string]: unknown;
}

/**
 * A stream's live state, as returned by `streams.get()`: the stream fields plus
 * what is playing right now.
 */
export interface StreamStatus extends Stream {
  /** What the monitor is doing now: `pending`, `running`, `errored` or `stopped`. */
  runtime_status: string;
  /** Why it is in that state (e.g. an auth wall on the host); null when it is fine. */
  status_reason: string | null;
  /** Null during ad breaks, talk, or audio we cannot place. */
  now_playing: { track: Track; started_at: string } | null;
  last_recognized_at: string | null;
  /** Recognition tuning hint in force; null means auto (all recognisers). */
  format: "electronic" | "classical" | "pop" | null;
}

/**
 * The response to `streams.update()`. The API echoes back only the fields you
 * changed, so everything but `id` is optional.
 */
export interface StreamUpdateResponse {
  id: string;
  format?: "electronic" | "classical" | "pop" | null;
  detection_mode?: "precise" | "balanced" | "broad";
  outage_notifications?: boolean;
}

export interface Webhook {
  id: string;
  url: string;
  event_types?: string[];
  /** Returned once, on creation. Store it to verify delivery signatures. */
  secret?: string;
  [key: string]: unknown;
}

/**
 * An event from the live SSE feed or a webhook delivery.
 * Types: `stream.play.started`, `stream.offline`, `stream.online`.
 */
export interface StreamEvent {
  id: string;
  type: string;
  created: number | string;
  data: {
    stream_id: string;
    started_at?: string;
    at?: string;
    reason?: string;
    track?: Track;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
