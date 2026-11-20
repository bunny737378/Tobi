// Offline MMCP envelope test for the AniDap connector (mocked Bridge).
// Run: node providers/anidap/test.mjs
import assert from "node:assert";

const MEDIA = {
  id: 21, title: { romaji: "ONE PIECE", english: "ONE PIECE", native: "ワンピース" },
  description: "Pirate adventure.", coverImage: { extraLarge: "https://cdn/cover.jpg", large: "https://cdn/cover.jpg" },
  bannerImage: "https://cdn/banner.jpg", genres: ["Action", "Adventure"], averageScore: 87, popularity: 771385,
  episodes: 1180, duration: 24, format: "TV", status: "RELEASING", season: "FALL", seasonYear: 1999,
  startDate: { year: 1999, month: 10, day: 20 }, studios: { nodes: [{ name: "Toei Animation" }] },
  trailer: { youtubeId: "abc" }, nextAiringEpisode: null,
  relations: { edges: [{ relationType: "SEQUEL", node: { id: 459, title: { romaji: "One Piece Movie 01", english: null }, coverImage: { large: "https://cdn/m1.jpg" }, format: "MOVIE" } }] }
};

const vault = new Map();
globalThis.Bridge = {
  vault: { get: (k) => vault.get(k) || null, set: (k, v) => vault.set(k, v) },
  log: () => {},
  http: {
    send: async (req) => {
      const u = req.url;
      const json = (obj, status = 200) => ({ status, finalUrl: u, headers: {}, bodyText: JSON.stringify(obj) });
      if (u.includes("graphql.anilist.co")) {
        const body = JSON.parse(req.bodyText || "{}");
        if (body.query.includes("Media(id")) return json({ data: { Media: MEDIA } });
        return json({ data: { Page: { pageInfo: { hasNextPage: false, total: 1 }, media: [MEDIA] } } });
      }
      if (u.includes("/api/anime/")) return json({ success: true, data: { id: "one-piece-kezlm" } });
      if (u.includes("/rest/api/episodes")) return json([{ number: 1, title: "Ep 1" }, { number: 2, title: "Ep 2" }]);
      if (u.includes("/rest/api/servers")) return json({ subProviders: [{ id: "yuki", tip: "t1" }, { id: "nero" }], dubProviders: [{ id: "yuki" }], hSubProviders: [] });
      if (u.includes("/rest/api/sources")) return json({
        sources: [{ url: "https://cdn/stream.m3u8", quality: "auto", type: "hls" }],
        headers: { Referer: "https://embed.example.com/" },
        tracks: [{ url: "https://cdn/en.vtt", lang: "English", label: "English" }],
        chapters: [{ title: "Opening", start: 85, end: 175 }, { title: "Ending", start: 1310, end: 1400 }]
      });
      return json({}, 404);
    }
  }
};

const c = await import("./connector.js");

function checkEnvelope(name, res) {
  assert.deepStrictEqual(Object.keys(res).sort(), ["fault", "ok", "paging", "payload"], name + " envelope keys");
  if (res.ok) assert.strictEqual(res.fault, null, name + " fault null on ok");
  else assert.ok(res.fault && res.fault.reason, name + " fault reason present");
  console.log("PASS", name, res.ok ? "(ok)" : "(fault: " + res.fault.reason + ")");
  return res;
}

const feed = checkEnvelope("fetchFeed", await c.fetchFeed(1, null));
assert.ok(feed.payload.spotlight.length >= 1 && feed.payload.shelves.length >= 1, "feed shelves");

const cat = checkEnvelope("queryCatalog", await c.queryCatalog({ keyword: "one piece", page: 1, filters: { genre: ["Action"] } }));
assert.ok(cat.payload.entries.length >= 1 && cat.payload.facets.length >= 1, "catalog facets");

const prof = checkEnvelope("fetchProfile", await c.fetchProfile("21", { anilistId: "21" }, null));
assert.strictEqual(prof.payload.uid, "21");
assert.strictEqual(prof.payload.groups[0].units.length, 2, "profile units from chad episodes");
assert.strictEqual(prof.payload.groups[0].units[0].carry.ep, "1");

const units = checkEnvelope("fetchUnits", await c.fetchUnits("grp_21", 1, null, { anilistId: "21", slug: "one-piece-kezlm" }));
assert.strictEqual(units.payload.units.length, 2);

const media = checkEnvelope("resolveMedia", await c.resolveMedia("tgt", { anilistId: "21", ep: "1", slug: "one-piece-kezlm" }, null));
assert.strictEqual(media.payload.sources.length, 3, "3 deferred servers (2 sub + 1 dub)");
assert.ok(media.payload.sources.every((s) => s.resolutionState === "deferred"), "all deferred");

const deferred = checkEnvelope("resolveDeferredSource", await c.resolveDeferredSource("src_yuki_sub", media.payload.sources[0].resolverCarry));
assert.strictEqual(deferred.payload.source.resolutionState, "ready");
assert.ok(deferred.payload.source.uri.endsWith(".m3u8"), "hls uri");
assert.strictEqual(deferred.payload.source.captions.length, 1, "caption from tracks");
assert.strictEqual(deferred.payload.timeline.markers.length, 2, "intro+ending markers");

console.log("\nAll MMCP envelope checks passed.");
