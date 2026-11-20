// AniDap connector — MMCP v1.0
// Metadata: AniList GraphQL (public, no key) — mirrors what anidap.lol displays.
// Streams: AniDap "chad" REST API (servers / sources / episodes) keyed by slug.
// Slug lookup: GET {BASE}/api/anime/{anilistId} -> { success, data: { id: slug } }
//              fallback: graphql.anidap.lol catalogAnime pagination (cached in vault).

const DEFAULT_BASE = "https://anidap.lol";
const CHAD = "https://chad.anidap.lol";
const ANILIST = "https://graphql.anilist.co";
const ANIDAP_GRAPHQL = "https://graphql.anidap.lol/graphql";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const PAGE_SIZE = 30;
const UNIT_PAGE = 100;

// ---------------------------------------------------------------- helpers

function ok(payload, paging) {
  return { ok: true, payload: payload || {}, paging: paging || null, fault: null };
}

function fault(reason, summary, recovery, targetUri) {
  return {
    ok: false,
    payload: null,
    paging: null,
    fault: { reason, summary, recovery: recovery || "notify_only", targetUri: targetUri || null, retryAfterSec: 0 }
  };
}

function base() {
  try {
    const v = globalThis.Bridge && globalThis.Bridge.vault && globalThis.Bridge.vault.get("mirror_domain");
    if (v && /^https?:\/\//i.test(String(v))) return String(v).replace(/\/+$/, "");
  } catch (e) { /* vault unavailable */ }
  return DEFAULT_BASE;
}

function log(level, msg) {
  try { globalThis.Bridge && globalThis.Bridge.log && globalThis.Bridge.log(level, "[anidap] " + msg); } catch (e) {}
}

async function httpSend(req) {
  const res = await globalThis.Bridge.http.send({
    url: req.url,
    method: req.method || "GET",
    headers: req.headers || {},
    bodyText: req.bodyText || null,
    timeoutMs: req.timeoutMs || 20000
  });
  return res || { status: 0, bodyText: "" };
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

function faultForStatus(status, url) {
  if (status === 403 || status === 503 || status === 429) {
    return fault("CHALLENGE_GATE", "AniDap is showing a verification challenge.", "solve_in_webview", url || base() + "/home");
  }
  if (status === 404) return fault("EXPIRED_ROUTE", "This title is no longer available on AniDap.", "notify_only", null);
  if (status >= 500 || status === 0) return fault("UNREACHABLE", "AniDap could not be reached. Check your connection.", "retry", null);
  return fault("UNREACHABLE", "Unexpected response (HTTP " + status + ") from AniDap.", "retry", null);
}

function apiHeaders(extra) {
  const b = base();
  const h = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Origin": b,
    "Referer": b + "/"
  };
  if (extra) for (const k of Object.keys(extra)) h[k] = extra[k];
  return h;
}

// AniList GraphQL POST
async function anilist(query, variables) {
  const res = await httpSend({
    url: ANILIST,
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json" },
    bodyText: JSON.stringify({ query, variables: variables || {} })
  });
  if (res.status === 429) throw { fault: fault("UNREACHABLE", "AniList rate limit hit. Try again shortly.", "retry", null) };
  const json = parseJson(res.bodyText);
  if (!json || !json.data) throw { fault: faultForStatus(res.status || 0, ANILIST) };
  return json.data;
}

const MEDIA_FIELDS = `
  id title { romaji english native } description
  coverImage { extraLarge large } bannerImage
  genres averageScore popularity episodes duration format status
  season seasonYear startDate { year month day }
  studios(isMain: true) { nodes { name } }
  trailer { youtubeId }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  relations { edges { relationType node { id title { romaji english } coverImage { large } format } } }
`;

function mediaName(m) {
  if (!m || !m.title) return "Unknown";
  return m.title.english || m.title.romaji || m.title.native || "Unknown";
}

function mediaKind(m) {
  const f = m && m.format;
  if (f === "MOVIE") return "movie";
  return "anime";
}

function entryCard(m, extra) {
  const badges = [];
  if (m.status) badges.push(m.status === "RELEASING" ? "Airing" : m.status === "FINISHED" ? "Finished" : m.status.replace(/_/g, " "));
  if (m.episodes) badges.push("Eps " + m.episodes);
  const card = {
    uid: String(m.id),
    name: mediaName(m),
    kind: mediaKind(m),
    visuals: {
      cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || null,
      banner: m.bannerImage || null,
      wordmark: null,
      net: null
    },
    badges: badges.slice(0, 2),
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    releaseYear: m.seasonYear || (m.startDate && m.startDate.year) || null,
    liveNow: false,
    carry: { anilistId: String(m.id) }
  };
  if (extra) for (const k of Object.keys(extra)) card[k] = extra[k];
  return card;
}

// ---------------------------------------------------------------- slug resolution

async function resolveSlug(anilistId) {
  const id = String(anilistId || "").trim();
  if (!id) return null;
  if (/^[a-z0-9]+-[a-z0-9-]+-[a-z0-9]+$/i.test(id)) return id; // already a slug

  // 1) vault cache
  try {
    const cached = globalThis.Bridge.vault.get("slug:" + id);
    if (cached) return cached;
  } catch (e) {}

  // 2) direct lookup endpoint
  try {
    const res = await httpSend({ url: base() + "/api/anime/" + encodeURIComponent(id), headers: apiHeaders() });
    const json = parseJson(res.bodyText);
    if (json && json.success && json.data && json.data.id) {
      try { globalThis.Bridge.vault.set("slug:" + id, json.data.id); } catch (e) {}
      return json.data.id;
    }
  } catch (e) { log("warn", "slug lookup failed: " + e); }

  // 3) fallback: paginate AniDap GraphQL catalogAnime (TRENDING sort)
  try {
    let offset = 0;
    for (let page = 0; page < 10; page++) {
      const res = await httpSend({
        url: ANIDAP_GRAPHQL,
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json" },
        bodyText: JSON.stringify({
          query: "query($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) { catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) { items { id anilistId } hasNextPage } }",
          variables: { filter: { isAdult: false }, sort: [{ field: "TRENDING", direction: "DESC" }], limit: 30, offset }
        })
      });
      const json = parseJson(res.bodyText);
      const items = json && json.data && json.data.catalogAnime && json.data.catalogAnime.items;
      if (!items || !items.length) break;
      const found = items.find((i) => String(i.anilistId) === id);
      if (found) {
        try { globalThis.Bridge.vault.set("slug:" + id, found.id); } catch (e) {}
        return found.id;
      }
      if (!json.data.catalogAnime.hasNextPage) break;
      offset += 30;
    }
  } catch (e) { log("warn", "slug graphql fallback failed: " + e); }

  return null;
}

// ---------------------------------------------------------------- episodes

function normalizeEpisodes(raw) {
  // chad /episodes returns an array; shape varies — normalize defensively.
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
  const out = [];
  for (const e of list) {
    if (e == null) continue;
    if (typeof e === "number") { out.push({ number: e, title: null }); continue; }
    const n = e.number ?? e.ep ?? e.episode ?? e.episodeNumber ?? e.id ?? e.ep_id;
    if (n == null) continue;
    out.push({
      number: Number(n),
      title: e.title || e.name || e.episodeTitle || null,
      thumb: e.thumb || e.image || e.thumbnail || null
    });
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

async function fetchEpisodeList(slug) {
  const res = await httpSend({ url: CHAD + "/rest/api/episodes?id=" + encodeURIComponent(slug), headers: apiHeaders() });
  if (res.status !== 200) throw { fault: faultForStatus(res.status, CHAD) };
  return normalizeEpisodes(parseJson(res.bodyText));
}

function toUnits(anilistId, slug, episodes, total) {
  return episodes.map((e) => ({
    unitId: anilistId + ":" + e.number,
    index: e.number,
    absoluteIndex: e.number,
    name: e.title || null,
    visuals: e.thumb ? { thumb: e.thumb } : null,
    synopsis: null,
    runtimeMin: null,
    airDate: null,
    flags: { upcoming: false, filler: false, recap: false, special: false },
    badges: [],
    carry: { anilistId: String(anilistId), ep: String(e.number), slug: slug || "" },
    net: null
  }));
}

// ---------------------------------------------------------------- Operation 1: fetchFeed

export async function fetchFeed(page, token) {
  try {
    const p = Math.max(1, Number(page) || 1);
    const q = `query($page: Int) { Page(page: $page, perPage: 30) {
      media(type: ANIME, isAdult: false, sort: [TRENDING_DESC]) { ${MEDIA_FIELDS} }
    } }`;
    const data = await anilist(q, { page: p });
    const media = (data.Page && data.Page.media) || [];
    if (!media.length) return ok({ spotlight: [], shortcuts: [], shelves: [] }, { current: p, hasMore: false, token: null });

    const spotlight = media.slice(0, 5).map((m) => entryCard(m, { summary: m.description || null }));
    const shelves = [
      { shelfId: "trending_now", heading: "Trending Now", cardStyle: "portrait", expandable: true, carry: { shelfId: "trending_now" }, entries: media.slice(0, 18).map((m) => entryCard(m)) },
      { shelfId: "most_popular", heading: "Most Popular", cardStyle: "portrait", expandable: true, carry: { shelfId: "most_popular" }, entries: media.slice(0, 18).map((m) => entryCard(m)) }
    ];
    // Second shelf re-sorted by popularity from the same page (avoids extra calls).
    shelves[1].entries = media.slice().sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 18).map((m) => entryCard(m));

    const shortcuts = [
      { shelfId: "trending_now", label: "Trending", carry: { shelfId: "trending_now" } },
      { shelfId: "most_popular", label: "Popular", carry: { shelfId: "most_popular" } },
      { shelfId: "cat_movies", label: "Movies", carry: { shelfId: "cat_movies" } },
      { shelfId: "cat_airing", label: "Airing", carry: { shelfId: "cat_airing" } }
    ];

    return ok({ spotlight, shortcuts, shelves }, { current: p, hasMore: false, token: null });
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "fetchFeed: " + e);
    return fault("UNREACHABLE", "Could not load the AniDap home feed.", "retry", null);
  }
}

// ---------------------------------------------------------------- Operation 2: queryCatalog

const SORT_MAP = { popular: "POPULARITY_DESC", trending: "TRENDING_DESC", newest: "UPDATED_AT_DESC", score: "SCORE_DESC", title: "TITLE_ROMAJI" };
const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

function catalogFacets() {
  return [
    { facetId: "genre", label: "Genre", selection: "multiple", choices: GENRES.map((g) => ({ value: g, label: g })) },
    { facetId: "format", label: "Type", selection: "multiple", choices: [
      { value: "TV", label: "TV Show" }, { value: "MOVIE", label: "Movie" }, { value: "ONA", label: "ONA" }, { value: "OVA", label: "OVA" }, { value: "TV_SHORT", label: "TV Short" }
    ] },
    { facetId: "status", label: "Status", selection: "single", choices: [
      { value: "RELEASING", label: "Airing" }, { value: "FINISHED", label: "Finished" }, { value: "NOT_YET_RELEASED", label: "Not Yet Aired" }
    ] },
    { facetId: "sort", label: "Order", selection: "single", choices: [
      { value: "popular", label: "Most Popular" }, { value: "trending", label: "Trending" }, { value: "newest", label: "Newest First" }, { value: "score", label: "Highest Rated" }
    ] }
  ];
}

export async function queryCatalog(request) {
  try {
    const req = request || {};
    const page = Math.max(1, Number(req.page) || 1);
    const filters = req.filters || {};
    const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

    const variables = { page, perPage: PAGE_SIZE };
    const args = ["type: ANIME", "isAdult: false", "page: $page", "perPage: $perPage"];

    if (req.keyword) { variables.search = String(req.keyword); args.push("search: $search"); }

    // Shelf presets from fetchFeed shortcuts
    const shelfId = req.shelfId || (req.carry && req.carry.shelfId) || null;
    if (shelfId === "cat_movies") { variables.format = "MOVIE"; args.push("format: $format"); }
    if (shelfId === "cat_airing") { variables.status = "RELEASING"; args.push("status: $status"); }
    if (shelfId === "trending_now") { variables.sort = ["TRENDING_DESC"]; args.push("sort: $sort"); }
    if (shelfId === "most_popular") { variables.sort = ["POPULARITY_DESC"]; args.push("sort: $sort"); }

    const genre = first(filters.genre);
    if (genre) { variables.genre = genre; args.push("genre: $genre"); }
    const format = first(filters.format);
    if (format) { variables.format = format; args.push("format: $format"); }
    const status = first(filters.status);
    if (status) { variables.status = status; args.push("status: $status"); }
    const sortKey = first(filters.sort);
    if (sortKey && SORT_MAP[sortKey]) { variables.sort = [SORT_MAP[sortKey]]; args.push("sort: $sort"); }

    const q = `query(${Object.keys(variables).filter((k) => k !== "page" && k !== "perPage").map((k) => "$" + k + ": " + (k === "sort" ? "[MediaSort]" : k === "search" || k === "genre" || k === "format" || k === "status" ? "String" : "Int")).join(", ")}) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage total } media(${args.join(", ")}) { ${MEDIA_FIELDS} } } }`;
    const data = await anilist(q, variables);
    const pageInfo = (data.Page && data.Page.pageInfo) || {};
    const media = (data.Page && data.Page.media) || [];
    const hasMore = !!pageInfo.hasNextPage;

    return ok(
      { entries: media.map((m) => entryCard(m)), facets: page === 1 ? catalogFacets() : [] },
      { current: page, hasMore, token: hasMore ? String(page + 1) : null, totalItems: pageInfo.total || null }
    );
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "queryCatalog: " + e);
    return fault("UNREACHABLE", "Search failed. Check your connection.", "retry", null);
  }
}

// ---------------------------------------------------------------- Operation 3: fetchProfile

export async function fetchProfile(uid, carry, net) {
  try {
    const anilistId = String((carry && carry.anilistId) || uid || "").trim();
    if (!anilistId) return fault("EXPIRED_ROUTE", "Missing title identifier.", "notify_only", null);

    const q = `query($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`;
    const data = await anilist(q, { id: Number(anilistId) });
    const m = data.Media;
    if (!m) return fault("EXPIRED_ROUTE", "This title was not found.", "notify_only", null);

    // Episodes via AniDap (best-effort — profile still renders from AniList alone).
    let slug = (carry && carry.slug) || null;
    let episodes = [];
    let total = m.episodes || 0;
    try {
      if (!slug) slug = await resolveSlug(anilistId);
      if (slug) {
        episodes = await fetchEpisodeList(slug);
        if (episodes.length) total = episodes.length;
      }
    } catch (e) { log("warn", "episodes fetch failed: " + e); }

    const deferred = total > UNIT_PAGE;
    const units = deferred ? [] : toUnits(anilistId, slug, episodes, total);

    const studio = m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name;
    const facts = {
      releaseYear: m.seasonYear || (m.startDate && m.startDate.year) || null,
      releaseDate: m.startDate && m.startDate.year ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
      state: m.status ? m.status.replace(/_/g, " ") : null,
      maturity: null,
      score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
      scoreVotes: null,
      runtimeMin: m.duration || null,
      country: "Japan",
      creator: studio || null,
      languages: ["Japanese"]
    };

    const relations = ((m.relations && m.relations.edges) || [])
      .filter((e) => e && e.node && e.node.id)
      .map((e) => ({
        relationship: e.relationType ? e.relationType.replace(/_/g, " ") : "Related",
        entry: entryCard(e.node)
      }));

    const payload = {
      uid: String(m.id),
      name: mediaName(m),
      aliases: m.title && m.title.native && m.title.native !== mediaName(m) ? [m.title.native] : [],
      kind: mediaKind(m),
      availability: "stream_and_download",
      visuals: {
        cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || null,
        banner: m.bannerImage || null,
        wordmark: null,
        net: null
      },
      tagline: null,
      synopsis: m.description || null,
      facts,
      genres: m.genres || [],
      badges: [m.format, m.status ? m.status.replace(/_/g, " ") : null].filter(Boolean),
      previewVideoUri: m.trailer && m.trailer.youtubeId ? "https://www.youtube.com/watch?v=" + m.trailer.youtubeId : null,
      crossRefs: { anilist: String(m.id) },
      credits: [],
      directTarget: null,
      liveSchedule: null,
      groups: total > 0 ? [{
        groupId: "grp_" + anilistId,
        index: 1,
        label: "Episodes",
        unitCount: total,
        deferredUnits: deferred,
        carry: { anilistId: String(anilistId), slug: slug || "" },
        units
      }] : [],
      relations,
      similar: []
    };

    return ok(payload, null);
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "fetchProfile: " + e);
    return fault("UNREACHABLE", "Could not load this title.", "retry", null);
  }
}

// ---------------------------------------------------------------- Operation 4: fetchUnits

export async function fetchUnits(groupId, page, token, carry) {
  try {
    const anilistId = String((carry && carry.anilistId) || String(groupId || "").replace(/^grp_/, "")).trim();
    if (!anilistId) return fault("EXPIRED_ROUTE", "Missing title identifier.", "notify_only", null);
    const p = Math.max(1, Number(page) || 1);

    let slug = (carry && carry.slug) || null;
    if (!slug) slug = await resolveSlug(anilistId);
    if (!slug) return fault("EXPIRED_ROUTE", "Streaming slug not found for this title.", "notify_only", null);

    const episodes = await fetchEpisodeList(slug);
    const start = (p - 1) * UNIT_PAGE;
    const slice = episodes.slice(start, start + UNIT_PAGE);
    const hasMore = start + UNIT_PAGE < episodes.length;

    return ok(
      { groupId: groupId || "grp_" + anilistId, units: toUnits(anilistId, slug, slice, episodes.length) },
      { current: p, hasMore, token: hasMore ? String(p + 1) : null, totalItems: episodes.length }
    );
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "fetchUnits: " + e);
    return fault("UNREACHABLE", "Could not load episodes.", "retry", null);
  }
}

// ---------------------------------------------------------------- Operation 5: resolveMedia

const PROVIDER_LABELS = { nero: "Nero", yuki: "Yuki", zuna: "Zuna", loli: "Loli", mimi: "Mimi", beep: "Beep", sora: "Sora", kiwi: "Kiwi", uwu: "Uwu", vee: "Vee", neko: "Neko", mochi: "Mochi", shiro: "Shiro", adp: "ADP" };

function normalizeProviders(data) {
  const list = [];
  const push = (arr, type) => {
    (arr || []).forEach((p) => {
      const name = typeof p === "string" ? p : p && (p.id || p.name);
      if (!name) return;
      list.push({ provider: String(name), type, tip: (p && p.tip) || null });
    });
  };
  if (data) { push(data.subProviders, "sub"); push(data.dubProviders, "dub"); push(data.hSubProviders, "hsub"); }
  return list;
}

export async function resolveMedia(targetId, carry, net) {
  try {
    const anilistId = String((carry && carry.anilistId) || "").trim();
    const ep = Number((carry && carry.ep) || 1);
    if (!anilistId) return fault("EXPIRED_ROUTE", "Missing title identifier.", "notify_only", null);

    let slug = (carry && carry.slug) || null;
    if (!slug) slug = await resolveSlug(anilistId);
    if (!slug) return fault("EXPIRED_ROUTE", "This title is not available on AniDap yet.", "notify_only", null);

    const res = await httpSend({
      url: CHAD + "/rest/api/servers?id=" + encodeURIComponent(slug) + "&epNum=" + ep,
      headers: apiHeaders({ "Content-Type": "application/json" })
    });
    if (res.status !== 200) return faultForStatus(res.status, CHAD);
    const providers = normalizeProviders(parseJson(res.bodyText));
    if (!providers.length) return fault("NOTHING_RESOLVABLE", "No streaming servers for this episode yet.", "switch_connector", null);

    const sources = providers.map((p, i) => ({
      sourceId: "src_" + p.provider + "_" + p.type,
      hostName: PROVIDER_LABELS[p.provider] || p.provider.toUpperCase(),
      displayLabel: (PROVIDER_LABELS[p.provider] || p.provider.toUpperCase()) + " • " + (p.type === "dub" ? "Dub" : p.type === "hsub" ? "HSub" : "Sub"),
      resolutionState: "deferred",
      uri: null,
      container: "hls",
      qualityTag: "Auto",
      priority: 100 - i * 5,
      resolverCarry: { slug, ep: String(ep), provider: p.provider, type: p.type, tip: p.tip || "" }
    }));

    return ok({ sources, acquisitions: [], sharedCaptions: [], timeline: null, playbackHints: { isLive: false, dvrWindowSec: null, resumeOffsetMs: null } }, null);
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "resolveMedia: " + e);
    return fault("UNREACHABLE", "Could not load streaming servers.", "retry", null);
  }
}

// ---------------------------------------------------------------- Operation 6: resolveDeferredSource

function fixUrl(u) {
  return u ? String(u).replace(":///", "://") : u;
}

export async function resolveDeferredSource(sourceId, resolverCarry) {
  try {
    const rc = resolverCarry || {};
    const slug = rc.slug, ep = rc.ep || "1", provider = rc.provider, type = rc.type || "sub";
    if (!slug || !provider) return fault("EXPIRED_ROUTE", "Missing resolver data for this server.", "notify_only", null);

    const res = await httpSend({
      url: CHAD + "/rest/api/sources?id=" + encodeURIComponent(slug) + "&epNum=" + ep + "&type=" + type + "&providerId=" + encodeURIComponent(provider),
      headers: apiHeaders()
    });
    if (res.status !== 200) return faultForStatus(res.status, CHAD);
    const data = parseJson(res.bodyText);
    const rawSources = (data && data.sources) || [];
    const first = rawSources.find((s) => s && s.url);
    if (!first) return fault("NOTHING_RESOLVABLE", "This server returned no playable stream.", "switch_connector", null);

    const headers = (data && data.headers) || {};
    const referer = headers.Referer || headers.referer || base() + "/";
    const uri = fixUrl(first.url);
    const container = /\.m3u8($|\?)/i.test(uri) ? "hls" : /\.mpd($|\?)/i.test(uri) ? "dash" : /\.mp4($|\?)/i.test(uri) ? "mp4" : "auto";

    const captions = ((data && data.tracks) || [])
      .filter((t) => t && t.url)
      .map((t) => ({
        uri: fixUrl(t.url),
        langCode: (t.lang || "en").substring(0, 2).toLowerCase(),
        label: t.label || t.lang || "English",
        syntax: /\.vtt($|\?)/i.test(t.url) ? "vtt" : "ass",
        defaultTrack: false,
        forced: false,
        net: null
      }));

    const markers = [];
    ((data && data.chapters) || []).forEach((c) => {
      if (!c || typeof c.start !== "number" || typeof c.end !== "number") return;
      const title = String(c.title || "").toLowerCase();
      if (title.includes("intro") || title.includes("opening")) markers.push({ kind: "opening", startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000) });
      else if (title.includes("outro") || title.includes("ending") || title.includes("ed")) markers.push({ kind: "ending", startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000) });
      else if (title.includes("recap")) markers.push({ kind: "recap", startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000) });
    });

    const source = {
      sourceId: sourceId || "src_" + provider + "_" + type,
      hostName: PROVIDER_LABELS[provider] || provider.toUpperCase(),
      displayLabel: (PROVIDER_LABELS[provider] || provider.toUpperCase()) + " • " + (type === "dub" ? "Dub" : type === "hsub" ? "HSub" : "Sub"),
      resolutionState: "ready",
      uri,
      container,
      qualityTag: first.quality || "Auto",
      priority: 100,
      net: { headers: { Referer: referer }, attachCookies: true, lockUserAgent: true },
      sidecarAudio: [],
      captions,
      encryption: null,
      decoderHint: "auto"
    };

    return ok({ source, timeline: markers.length ? { markers, chapters: [], storyboard: null } : null }, null);
  } catch (e) {
    if (e && e.fault) return e.fault;
    log("error", "resolveDeferredSource: " + e);
    return fault("UNREACHABLE", "Could not resolve this server.", "retry", null);
  }
}
