# Changelog

All notable changes to this package are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
