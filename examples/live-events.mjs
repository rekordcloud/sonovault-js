// Follow your monitored streams in real time over Server-Sent Events.
// Needs at least one registered stream (POST /v1/streams).
// Run: SONOVAULT_API_KEY=svk_live_... node examples/live-events.mjs
import { SonoVault } from "sonovault";

const sv = new SonoVault({ apiKey: process.env.SONOVAULT_API_KEY });

// Stop listening after 5 minutes.
const controller = new AbortController();
setTimeout(() => controller.abort(), 5 * 60 * 1000);

console.log("Listening for stream events (5 minutes)...");
try {
  for await (const event of sv.streams.live({ signal: controller.signal })) {
    if (event.type === "stream.play.started") {
      const track = event.data.track;
      console.log(`[${event.data.stream_id}] now playing: ${track?.artists?.[0]?.name} - ${track?.title}`);
    } else {
      console.log(`[${event.data.stream_id}] ${event.type}`);
    }
  }
} catch (err) {
  if (err.name !== "AbortError") throw err;
}
console.log("Done.");
