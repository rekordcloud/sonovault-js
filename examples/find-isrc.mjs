// Find a track's ISRC, genre, and label from artist + title.
// Run: SONOVAULT_API_KEY=svk_live_... node examples/find-isrc.mjs
import { SonoVault } from "sonovault";

const sv = new SonoVault({ apiKey: process.env.SONOVAULT_API_KEY });

const { results } = await sv.tracks.search({
  artist: "Daft Punk",
  title: "Harder, Better, Faster, Stronger",
  limit: 1,
});

const track = results[0];
console.log("Title: ", track.title);
console.log("ISRC:  ", track.isrc);
console.log("Genre: ", track.genre);
console.log("Label: ", track.releases[0]?.label?.name);
