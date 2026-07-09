/** Error thrown for any non-2xx API response. */
export class SonoVaultError extends Error {
  /** HTTP status code, or 0 for network errors. */
  readonly status: number;
  /** Parsed JSON error body, when the API returned one. */
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = undefined) {
    super(message);
    this.name = "SonoVaultError";
    this.status = status;
    this.body = body;
  }

  /** Missing or invalid API key. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** The endpoint needs a paid tier (or an admin key). */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Rate limit or monthly credit quota hit. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}
