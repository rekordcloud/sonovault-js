// Receive and verify SonoVault webhook deliveries.
// 1. Register the endpoint: sv.webhooks.create({ url: "https://your.host/webhooks/sonovault" })
// 2. Store the returned secret (shown only once) in SONOVAULT_WEBHOOK_SECRET.
// Run: SONOVAULT_WEBHOOK_SECRET=whsec_... node examples/webhook-server.mjs
import { createServer } from "node:http";
import { verifyWebhookSignature } from "sonovault";

const secret = process.env.SONOVAULT_WEBHOOK_SECRET;

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/sonovault") {
    res.writeHead(404).end();
    return;
  }

  // Collect the RAW body. Verify before parsing JSON.
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const payload = Buffer.concat(chunks);
    const ok = verifyWebhookSignature({
      secret,
      header: req.headers["sonovault-signature"] ?? "",
      payload,
    });
    if (!ok) {
      res.writeHead(400).end();
      return;
    }

    const event = JSON.parse(payload.toString("utf8"));
    // Dedupe on the stable event id: deliveries are retried on failure.
    console.log(event.id, event.type, event.data.stream_id, event.data.track?.title ?? "");
    res.writeHead(200).end();
  });
});

server.listen(8787, () => console.log("Listening on :8787"));
