// Resolve one ISRC to its ID and deep link on every supported platform.
// Run: SONOVAULT_API_KEY=svk_live_... node examples/cross-platform-links.mjs
import { SonoVault } from "sonovault";

const sv = new SonoVault({ apiKey: process.env.SONOVAULT_API_KEY });

// "One More Time" by Daft Punk
const { links } = await sv.tracks.links({ isrc: "GBDUW0000053" });

for (const link of links) {
  console.log(link.source.padEnd(12), link.url);
}
