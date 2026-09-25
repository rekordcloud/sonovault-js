# Changelog

All notable changes to this package are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [4.2.1] - 2026-09-25

### Changed

- Document that `discogs_id` (on `tracks.links` and as a `tracks.resolve` input type) is a Discogs track key: release ID plus track position, e.g. `2844-A`. A bare release ID returns not found.

## [4.2.0] - 2026-09-19

### Added

- `label` and `catalog_no` on each `ReleaseEdition`: the label that issued that pressing and its catalog number. Pressings of one album often differ (the UK original and a US reissue each carry their own), which the single release-level `label` cannot show.
- `from` and `until` on `artists.releases()` and `labels.releases()`: inclusive `YYYY-MM-DD` release-date bounds, so `labels.releases(id, { from: "2026-09-11", until: "2026-09-11" })` lists what a label released that day. Undated releases are left out when either is set. The params are typed by the new `ReleaseListParams`.

## [4.1.0] - 2026-09-14

### Added

- `ReleaseEdition` and `Release.editions`: the real editions behind a release. A SonoVault release groups every edition of an album onto one record, so the single, the album, the deluxe edition and the box set share one ID; `editions` names the editions behind it, each with its provider, format, release date, barcode, country and track count. At most 20, ordered so each is a genuinely different edition rather than twenty pressings of the same one.
- `releases.get(id, { edition })` renders one edition's track numbering instead of the default consensus. Tracks that edition does not carry keep a null position and come last, and `Release.edition` echoes what you asked for.

## [4.0.0] - 2026-09-04

### Added

- `ReleaseTrack`, the shape `GET /v1/releases/:id` actually returns in `tracks[]`. Same as `Track` without the `releases` array (the release is the object you are already looking at), plus `disc_number` and `track_number`.
- `Release.tracks` is a `ReleaseTrack[]`, in playing order: disc, then track number, with any track whose position is unknown last.
- `Artist` declares the public profile fields it has always returned (`country`, `formation_year`, `formation_date`, `social_links`, `wikidata_id`) instead of leaving them to the index signature, and adds `musicbrainz_id`, the MusicBrainz artist MBID.
- `Release.musicbrainz_release_ids` and `Release.musicbrainz_release_group_ids`, returned by `releases.get()`. Arrays because a SonoVault release groups every edition of an album and each edition carries its own MBID, so you pick the edition you need. Empty when unmapped.

### Fixed

- **`Release.tracks` was typed `Track[]`.** That shape has a `releases` array, which this endpoint has never returned, so code reading `release.tracks[0].releases` type-checked and was `undefined` at runtime. Correcting it to `ReleaseTrack[]` will stop that code compiling, which is the point. Same class of type-only correction as 3.0.0, hence the major bump.

## [3.0.0] - 2026-09-02

These are type-only corrections: the runtime behaviour of the client is unchanged. They are a major release because code written against the old, wrong types will no longer compile, which is the point. Nothing about the API changed; the types finally describe what it has always returned.

### Fixed

- **`Track.genre` and `Track.subgenre` are `string[]`, not `string | null`.** The API has always returned arrays (`["House"]`, and `[]` when unclassified), so the old types described a shape the server never sends.
- **`Genre` described a response the API does not return.** It declared an optional `subgenres` array and omitted `type` and `parent`. Checked against all 443 rows of `GET /v1/genres`: every row carries exactly `id`, `name`, `type`, `parent`, and none carries `subgenres`.
- **`streams.update()` no longer claims to return a full `Stream`.** `PATCH /v1/streams/:id` echoes back `id` plus only the fields you changed, which is now its own `StreamUpdateResponse` type.

### Added

- `Stream` declares the fields the API actually returns: `detection_mode`, `outage_notifications`, `created_at`, `stopped_at`, plus proper types for `name` and `status`.
- `StreamStatus`, the return type of `streams.get()`: adds `runtime_status`, `status_reason`, `now_playing`, `last_recognized_at` and `format` on top of `Stream`.
- `PlatformLinksResponse.isrc`, returned by `GET /v1/tracks/links` and previously undeclared.

## [2.0.0] - 2026-08-22

### Removed

- **BREAKING:** `tracks.identify()` and the `IdentifyRequest` type. The API's client-side-Chromaprint request body (`POST /v1/tracks/identify` with a JSON `fingerprint` array) was removed on 2026-08-22 and now returns 415, so the method could only fail. Use `tracks.identifyAudio()` instead: send the raw audio bytes and the server fingerprints them. It is also the more accurate route, because cross-window voting, the tempo cross-check, and a second independent matcher all need the audio itself.

## [1.2.0] - 2026-07-09

### Added

- `examples/` folder: find an ISRC, cross-platform links, play-log enrichment, live SSE events, and a webhook receiver with signature verification.
- `paginate()` helper: iterate every item across all pages of any cursor-paginated endpoint.

## [1.1.0] - 2026-07-09

### Added

- `verifyWebhookSignature()` helper for checking the `SonoVault-Signature` header on webhook deliveries (HMAC-SHA256, constant-time compare, replay-window check).
- `timeoutMs` client option (default 30000, 0 disables). Requests previously had no timeout and could hang on a dead connection.
- `webhooks.get(id)` for fetching a single webhook endpoint.
- `User-Agent: sonovault-js/<version>` header on every request.

### Fixed

- `streams.live()` now consumes the endpoint as Server-Sent Events and returns an async iterator of parsed events. It previously tried to parse the infinite stream as JSON and hung.

## [1.0.0] - 2026-07-09

### Added

- Initial release.
- `SonoVault` client covering the full public API: tracks (search, get, byIsrc, iswc, byIswc, links, resolve, identify, identifyAudio, browse), artists, labels, releases, genres, suggestions, streams, and webhooks.
- Cursor pagination on all list endpoints.
- Typed errors via `SonoVaultError` with `isAuthError`, `isForbidden`, and `isRateLimited` helpers.
- Automatic retry on 5xx responses and on 429 responses that carry a `Retry-After` header.
- ESM and CommonJS builds, Node 18+.
- Live integration test suite, skipped unless `SONOVAULT_API_KEY` is set.
