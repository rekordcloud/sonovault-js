// Enrich a play log that only has artist + title with ISRC, album, and label.
// Typical use: preparing a royalty report from radio automation output.
// Run: SONOVAULT_API_KEY=svk_live_... node examples/enrich-play-log.mjs
import { SonoVault } from "sonovault";

const sv = new SonoVault({ apiKey: process.env.SONOVAULT_API_KEY });

// In real use, read these lines from your playout export.
const playLog = [
  { artist: "Daft Punk", title: "One More Time" },
  { artist: "Daft Punk", title: "Around the World" },
  { artist: "Daft Punk", title: "Veridis Quo" },
];

const batch = await sv.tracks.resolve({ input_type: "track_name", items: playLog });

for (const row of batch.results) {
  if (row.status !== "matched") {
    console.log(`NOT FOUND: ${row.input.artist} - ${row.input.title}`);
    continue;
  }
  const release = row.track.releases[0];
  console.log(
    [row.track.artists[0]?.name, row.track.title, row.track.isrc, release?.title, release?.label?.name].join(" | "),
  );
}

console.log(`\nProcessed ${batch.processed} lines, ${batch.credits_used} credits used.`);
