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
  genre: string | null;
  subgenre: string | null;
}

/** A cursor-paginated page. `next_cursor` is null on the last page. */
export interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

export interface Artist {
  id: number;
  name: string;
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
  tracks?: Track[];
  [key: string]: unknown;
}

export interface Genre {
  id: number;
  name: string;
  subgenres?: { id: number; name: string }[];
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

export interface IdentifyRequest {
  /** 50–50,000 integers from `fpcalc -raw` (Chromaprint). */
  fingerprint: number[];
  /** Clip duration in seconds. */
  fingerprint_duration?: number;
  /** Max results to return, 1–25. */
  top_n?: number;
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
  url?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Webhook {
  id: string;
  url: string;
  event_types?: string[];
  /** Returned once, on creation — store it to verify delivery signatures. */
  secret?: string;
  [key: string]: unknown;
}
