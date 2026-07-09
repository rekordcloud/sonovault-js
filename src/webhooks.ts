import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a `SonoVault-Signature` webhook header against the raw request body.
 *
 * The header format is `t=<unix>,v1=<hex>` where
 * `v1 = HMAC-SHA256(secret, "<t>.<rawBody>")`. Use the `secret` returned once
 * by `sv.webhooks.create()`. Compute over the RAW body bytes, before any JSON
 * parsing. Constant-time compare. Rejects timestamps outside
 * `toleranceSeconds` (default 300; pass 0 to disable the age check).
 *
 * ```ts
 * app.post("/webhooks/sonovault", express.raw({ type: "application/json" }), (req, res) => {
 *   const ok = verifyWebhookSignature({
 *     secret: process.env.SONOVAULT_WEBHOOK_SECRET!,
 *     header: req.header("SonoVault-Signature") ?? "",
 *     payload: req.body,
 *   });
 *   if (!ok) return res.status(400).end();
 *   res.status(200).end();
 * });
 * ```
 */
export function verifyWebhookSignature(options: {
  secret: string;
  header: string;
  payload: string | Buffer;
  toleranceSeconds?: number;
}): boolean {
  const { secret, header, payload, toleranceSeconds = 300 } = options;
  if (!secret || !header) return false;

  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSeconds) {
    return false;
  }

  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
