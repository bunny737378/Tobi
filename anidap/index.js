/**
 * Anidap MMCP v1.0 Connector
 * Standalone ES2020 module for QuickJS + globalThis.Bridge
 *
 * Implements:
 *  - fetchFeed(page, token)
 *  - queryCatalog(request)
 *  - fetchProfile(uid, carry, net)
 *  - fetchUnits(groupId, page, token, carry)
 *  - resolveMedia(targetId, carry, net)
 *  - resolveDeferredSource(sourceId, resolverCarry)
 */

const DEFAULT_ORIGIN = "https://anidap.lol";
const GRAPHQL_BASE = "https://graphql.anidap.lol";
const CHAD_BASE = "https://chad.anidap.lol";
const DEFAULT_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const CATALOG_PAGE_SIZE = 24;
const EPISODE_CHUNK_SIZE = 100;

const HOST_FALLBACK_REFERERS = {
  nero: "https://animex.one/",
  yuki: "https://megaplay.buzz/",
  zuna: "https://zokoanime.video/",
  sora: "https://kaa.lt/",
  shiro: "https://kem.clvd.xyz/",
  uwu: "https://kwik.cx/",
  kiwi: "https://anidb.app/",
  miku: "https://allanime.uns.bio/",
};

const HOST_DISPLAY_NAMES = {
  nero: "Nero",
  yuki: "Yuki",
  zuna: "Zuna",
  sora: "Sora",
  loli: "Loli",
  shiro: "Shiro",
  vee: "Vee",
  uwu: "Uwu",
  kiwi: "Kiwi",
  miku: "Miku",
  neko: "Neko",
  mochi: "Mochi",
  beep: "Beep",
};

const HOST_PRIORITY_RANK = {
  nero: 100,
  yuki: 95,
  zuna: 88,
  sora: 84,
  vee: 80,
  shiro: 75,
  kiwi: 70,
  miku: 68,
  uwu: 65,
  neko: 60,
  mochi: 55,
  beep: 50,
  loli: 40,
};

const LANG_NAME_TO_CODE = {
  english: "en",
  eng: "en",
  en: "en",
  arabic: "ar",
  ara: "ar",
  ar: "ar",
  french: "fr",
  fre: "fr",
  fra: "fr",
  fr: "fr",
  german: "de",
  ger: "de",
  deu: "de",
  de: "de",
  spanish: "es",
  spa: "es",
  es: "es",
  italian: "it",
  ita: "it",
  it: "it",
  portuguese: "pt",
  por: "pt",
  pt: "pt",
  russian: "ru",
  rus: "ru",
  ru: "ru",
  japanese: "ja",
  jpn: "ja",
  ja: "ja",
  korean: "ko",
  kor: "ko",
  ko: "ko",
  chinese: "zh",
  chi: "zh",
  zho: "zh",
  zh: "zh",
  hindi: "hi",
  hin: "hi",
  hi: "hi",
  thai: "th",
  tha: "th",
  th: "th",
  vietnamese: "vi",
  vie: "vi",
  vi: "vi",
  indonesian: "id",
  ind: "id",
  id: "id",
  turkish: "tr",
  tur: "tr",
  tr: "tr",
  polish: "pl",
  pol: "pl",
  pl: "pl",
};

const CATALOG_FACETS = [
  {
    facetId: "sort",
    label: "Sort By",
    selection: "single",
    choices: [
      { value: "TRENDING", label: "Trending" },
      { value: "POPULARITY", label: "Most Popular" },
      { value: "AVERAGE_SCORE", label: "Top Rated" },
      { value: "UPDATED_AT", label: "Recently Updated" },
      { value: "SEASON_YEAR", label: "Newest Release" },
      { value: "FAVOURITES", label: "Most Favorited" },
    ],
  },
  {
    facetId: "format",
    label: "Format",
    selection: "multiple",
    choices: [
      { value: "TV", label: "TV Series" },
      { value: "MOVIE", label: "Movie" },
      { value: "OVA", label: "OVA" },
      { value: "ONA", label: "ONA" },
      { value: "SPECIAL", label: "Special" },
    ],
  },
  {
    facetId: "audio",
    label: "Audio",
    selection: "single",
    choices: [
      { value: "ANY", label: "All" },
      { value: "SUB", label: "Subbed" },
      { value: "DUB", label: "Dubbed" },
      { value: "BOTH", label: "Sub & Dub" },
    ],
  },
  {
    facetId: "status",
    label: "Status",
    selection: "multiple",
    choices: [
      { value: "RELEASING", label: "Airing" },
      { value: "FINISHED", label: "Completed" },
      { value: "NOT_YET_RELEASED", label: "Upcoming" },
    ],
  },
  {
    facetId: "genre",
    label: "Genre",
    selection: "multiple",
    choices: [
      { value: "Action", label: "Action" },
      { value: "Adventure", label: "Adventure" },
      { value: "Comedy", label: "Comedy" },
      { value: "Drama", label: "Drama" },
      { value: "Fantasy", label: "Fantasy" },
      { value: "Horror", label: "Horror" },
      { value: "Mecha", label: "Mecha" },
      { value: "Music", label: "Music" },
      { value: "Mystery", label: "Mystery" },
      { value: "Psychological", label: "Psychological" },
      { value: "Romance", label: "Romance" },
      { value: "Sci-Fi", label: "Sci-Fi" },
      { value: "Slice of Life", label: "Slice of Life" },
      { value: "Sports", label: "Sports" },
      { value: "Supernatural", label: "Supernatural" },
      { value: "Thriller", label: "Thriller" },
    ],
  },
  {
    facetId: "season",
    label: "Season",
    selection: "multiple",
    choices: [
      { value: "WINTER", label: "Winter" },
      { value: "SPRING", label: "Spring" },
      { value: "SUMMER", label: "Summer" },
      { value: "FALL", label: "Fall" },
    ],
  },
];

const CATALOG_GQL = `query CatalogAnime($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) {
  catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      titles
      coverImage
      bannerImage
      backdropUrl
      status
      format
      averageScore
      episodeCount
      seasonYear
      genres
      duration
    }
    currentPage
    hasNextPage
    totalCount
  }
}`;

// ---------------------------------------------------------------------------
// Envelope & Fault Helpers
// ---------------------------------------------------------------------------

function ok(payload, paging = null) {
  return {
    ok: true,
    payload,
    paging: paging || null,
    fault: null,
  };
}

function fail(reason, summary, recovery = "retry", targetUri = null, retryAfterSec = 0) {
  return {
    ok: false,
    payload: null,
    paging: null,
    fault: {
      reason,
      summary,
      recovery,
      targetUri: targetUri || null,
      retryAfterSec: retryAfterSec || 0,
    },
  };
}

function log(level, message) {
  try {
    if (globalThis.Bridge && typeof globalThis.Bridge.log === "function") {
      globalThis.Bridge.log(level, "[Anidap] " + String(message));
    }
  } catch (_) {}
}

async function getConfig(key, fallback) {
  try {
    if (globalThis.Bridge && globalThis.Bridge.vault && typeof globalThis.Bridge.vault.get === "function") {
      const val = await globalThis.Bridge.vault.get(key);
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        return String(val).trim();
      }
    }
  } catch (_) {}
  return fallback;
}

async function getOrigin() {
  const configured = await getConfig("mirror_domain", DEFAULT_ORIGIN);
  return configured.replace(/\/+$/, "");
}

async function getIncludeAdult() {
  const raw = await getConfig("include_adult", "false");
  return raw.toLowerCase() === "true" || raw === "1";
}

async function getPreferredAudio() {
  const raw = await getConfig("preferred_audio", "sub");
  return raw.toLowerCase() === "dub" ? "dub" : "sub";
}

// ---------------------------------------------------------------------------
// Pure ES2020 Utilities (No Node/Browser-only APIs)
// ---------------------------------------------------------------------------

function sanitizeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let url = raw.trim();
  if (!url) return null;
  if (url.startsWith("//")) {
    url = "https:" + url;
  } else if (url.startsWith("https:///")) {
    url = "https://" + url.slice(9);
  } else if (url.startsWith("http:///")) {
    url = "http://" + url.slice(8);
  }
  url = url.replace(/^(https?:)\/{3,}/i, "$1//");
  return url;
}

function extractOrigin(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/^(https?:\/\/[^/?#]+)/i);
  return match ? match[1] : null;
}

function extractHost(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/^https?:\/\/([^/?#:]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function stripHtml(input) {
  if (!input || typeof input !== "string") return null;
  let text = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function normalizeScore(rawScore) {
  if (rawScore === null || rawScore === undefined) return null;
  const n = Number(rawScore);
  if (!isFinite(n) || n <= 0) return null;
  if (n > 10) {
    return Math.round((n / 10) * 10) / 10;
  }
  return Math.round(n * 10) / 10;
}

function mapFormatToKind(format) {
  if (!format || typeof format !== "string") return "anime";
  const upper = format.toUpperCase();
  if (upper === "MOVIE") return "movie";
  return "anime";
}

function formatStatusLabel(status) {
  if (!status || typeof status !== "string") return null;
  const s = status.toUpperCase();
  if (s === "RELEASING") return "Ongoing";
  if (s === "FINISHED") return "Completed";
  if (s === "NOT_YET_RELEASED") return "Upcoming";
  if (s === "CANCELLED") return "Cancelled";
  if (s === "HIATUS") return "Hiatus";
  return status;
}

function formatRelationLabel(rel) {
  if (!rel || typeof rel !== "string") return "Related";
  return rel
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function normalizeLangCode(lang, label) {
  const candidates = [lang, label];
  for (let i = 0; i < candidates.length; i++) {
    const raw = candidates[i];
    if (!raw || typeof raw !== "string") continue;
    const cleaned = raw.trim().toLowerCase().replace(/[^a-z-]/g, "");
    if (!cleaned) continue;
    if (LANG_NAME_TO_CODE[cleaned]) return LANG_NAME_TO_CODE[cleaned];
    const firstWord = cleaned.split("-")[0];
    if (LANG_NAME_TO_CODE[firstWord]) return LANG_NAME_TO_CODE[firstWord];
    if (cleaned.length === 2) return cleaned;
  }
  return "und";
}

function detectCaptionSyntax(url) {
  if (!url) return "vtt";
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return "ass";
  if (lower.endsWith(".srt")) return "srt";
  if (lower.endsWith(".ttml") || lower.endsWith(".dfxp")) return "ttml";
  return "vtt";
}

function detectContainer(url, mimeType, isM3U8) {
  const u = (url || "").toLowerCase();
  const t = (mimeType || "").toLowerCase();
  if (
    isM3U8 === true ||
    t.indexOf("mpegurl") !== -1 ||
    u.indexOf(".m3u8") !== -1 ||
    u.indexOf("index.txt") !== -1 ||
    u.indexOf("deeznuts.txt") !== -1 ||
    u.endsWith(".txt")
  ) {
    return "hls";
  }
  if (t.indexOf("dash") !== -1 || u.indexOf(".mpd") !== -1) return "dash";
  if (t.indexOf("webm") !== -1 || u.indexOf(".webm") !== -1) return "webm";
  if (t.indexOf("mp4") !== -1 || u.indexOf(".mp4") !== -1) return "mp4";
  if (t.indexOf("matroska") !== -1 || u.indexOf(".mkv") !== -1) return "mkv";
  return "hls";
}

function base64UrlDecodeAscii(input) {
  if (!input || typeof input !== "string") return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4 !== 0) str += "=";
  let out = "";
  for (let i = 0; i < str.length; i += 4) {
    const c1 = alphabet.indexOf(str[i]);
    const c2 = alphabet.indexOf(str[i + 1]);
    const c3 = str[i + 2] === "=" ? -1 : alphabet.indexOf(str[i + 2]);
    const c4 = str[i + 3] === "=" ? -1 : alphabet.indexOf(str[i + 3]);
    if (c1 < 0 || c2 < 0) return null;
    const b1 = (c1 << 2) | (c2 >> 4);
    out += String.fromCharCode(b1);
    if (c3 >= 0) {
      const b2 = ((c2 & 15) << 4) | (c3 >> 2);
      out += String.fromCharCode(b2);
    }
    if (c4 >= 0) {
      const b3 = ((c3 & 3) << 6) | c4;
      out += String.fromCharCode(b3);
    }
  }
  return out;
}

function extractTokenExpirySec(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const decoded = base64UrlDecodeAscii(match[1]);
  if (!decoded) return null;
  const tsMatch = decoded.match(/^(\d{10})\|/);
  if (!tsMatch) return null;
  const sec = parseInt(tsMatch[1], 10);
  return isFinite(sec) ? sec : null;
}

function pickCover(coverObj) {
  if (!coverObj) return null;
  if (typeof coverObj === "string") return sanitizeUrl(coverObj);
  return sanitizeUrl(coverObj.extraLarge || coverObj.large || coverObj.medium || null);
}

function pickTitle(item) {
  if (!item) return "Untitled";
  if (typeof item.title === "string" && item.title.trim()) return item.title.trim();
  const titleObj = item.title && typeof item.title === "object" ? item.title : null;
  const titlesObj = item.titles && typeof item.titles === "object" ? item.titles : null;
  const candidates = [
    item.titleEnglish,
    item.englishTitle,
    titleObj ? titleObj.english : null,
    titleObj ? titleObj.userPreferred : null,
    item.titleUserPreferred,
    titlesObj ? titlesObj.en : null,
    item.titleRomaji,
    item.romajiTitle,
    titleObj ? titleObj.romaji : null,
    titlesObj ? titlesObj["x-jat"] : null,
    item.nativeTitle,
    titleObj ? titleObj.native : null,
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === "string" && candidates[i].trim()) {
      return candidates[i].trim();
    }
  }
  return "Untitled";
}

function getCanonicalSlug(item) {
  if (!item) return "";
  if (typeof item.slug === "string" && item.slug.trim()) return item.slug.trim();
  if (typeof item.id === "string" && item.id.trim()) return item.id.trim();
  if (item.anilistId !== undefined && item.anilistId !== null) return String(item.anilistId);
  return "";
}

function buildCarry(item) {
  const carry = {};
  const slug = getCanonicalSlug(item);
  if (slug) carry.slug = slug;
  if (item && item.anilistId !== undefined && item.anilistId !== null) {
    carry.anilistId = String(item.anilistId);
  }
  if (item && item.malId !== undefined && item.malId !== null) {
    carry.malId = String(item.malId);
  }
  return carry;
}

// ---------------------------------------------------------------------------
// HTTP Layer (Bridge.http.send)
// ---------------------------------------------------------------------------

function isCloudflareChallenge(status, headers, bodyText) {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  const lowerHeaders = {};
  if (headers && typeof headers === "object") {
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
      lowerHeaders[keys[i].toLowerCase()] = String(headers[keys[i]]).toLowerCase();
    }
  }
  if (lowerHeaders["cf-mitigated"] === "challenge") return true;
  const body = String(bodyText || "");
  if (
    body.indexOf("Just a moment...") !== -1 ||
    body.indexOf("cf-browser-verification") !== -1 ||
    body.indexOf("Attention Required! | Cloudflare") !== -1 ||
    body.indexOf("challenge-platform") !== -1
  ) {
    return true;
  }
  return false;
}

async function httpJson(url, options = {}) {
  const origin = await getOrigin();
  const headers = {
    "User-Agent": DEFAULT_UA,
    Accept: "application/json",
    Referer: origin + "/",
    Origin: origin,
  };
  if (options.headers) {
    const keys = Object.keys(options.headers);
    for (let i = 0; i < keys.length; i++) {
      headers[keys[i]] = options.headers[keys[i]];
    }
  }

  let res;
  try {
    res = await globalThis.Bridge.http.send({
      url,
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? options.body : null,
      timeoutMs: options.timeoutMs || 15000,
    });
  } catch (err) {
    return {
      ok: false,
      fault: fail("UNREACHABLE", "Network request failed: " + String(err && err.message ? err.message : err), "retry", url),
    };
  }

  const status = res && typeof res.status === "number" ? res.status : 0;
  const bodyText = res && typeof res.bodyText === "string" ? res.bodyText : "";

  if (isCloudflareChallenge(status, res ? res.headers : null, bodyText)) {
    return {
      ok: false,
      fault: fail(
        "CHALLENGE_GATE",
        "Cloudflare verification required before accessing Anidap.",
        "solve_in_webview",
        origin + "/home",
        0
      ),
    };
  }

  if (status === 404) {
    return {
      ok: false,
      status,
      fault: fail("EXPIRED_ROUTE", "Requested item was not found on Anidap (HTTP 404).", "notify_only", url),
    };
  }

  if (status < 200 || status >= 300) {
    return {
      ok: false,
      status,
      fault: fail("UNREACHABLE", "Upstream server returned HTTP " + status + ".", "retry", url),
    };
  }

  try {
    const json = JSON.parse(bodyText);
    return { ok: true, status, data: json };
  } catch (err) {
    return {
      ok: false,
      status,
      fault: fail("SCHEMA_DRIFT", "Failed to parse JSON response from Anidap.", "notify_only", url),
    };
  }
}

async function queryGraphQL(query, variables) {
  const res = await httpJson(GRAPHQL_BASE + "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return res;
  if (res.data && Array.isArray(res.data.errors) && res.data.errors.length > 0 && !res.data.data) {
    return {
      ok: false,
      fault: fail("SCHEMA_DRIFT", res.data.errors[0].message || "GraphQL query error.", "notify_only"),
    };
  }
  return { ok: true, data: res.data ? res.data.data : null };
}

// ---------------------------------------------------------------------------
// Entry Card Mappers
// ---------------------------------------------------------------------------

function mapCatalogItemToEntryCard(item) {
  const uid = getCanonicalSlug(item);
  const badges = [];
  if (item.format) badges.push(String(item.format));
  if (item.episodeCount && Number(item.episodeCount) > 0) {
    badges.push(String(item.episodeCount) + " Eps");
  } else if (item.status === "RELEASING") {
    badges.push("Airing");
  }

  return {
    uid,
    name: pickTitle(item),
    kind: mapFormatToKind(item.format),
    visuals: {
      cover: pickCover(item.coverImage) || sanitizeUrl(item.coverImageExtraLarge || item.image),
      banner: sanitizeUrl(item.backdropUrl || item.bannerImage || item.bannerUrl || null),
      wordmark: null,
      net: null,
    },
    badges: badges.slice(0, 2),
    score: normalizeScore(item.averageScore !== undefined ? item.averageScore : item.meanScore),
    releaseYear: item.seasonYear ? Number(item.seasonYear) : null,
    liveNow: false,
    carry: buildCarry(item),
  };
}

function mapRecentItemToEntryCard(item) {
  const uid = getCanonicalSlug(item);
  const badges = [];
  if (item.episode !== undefined && item.episode !== null) {
    badges.push("Ep " + String(item.episode));
  }
  if (item.isSub && item.isDub) {
    badges.push("SUB • DUB");
  } else if (item.isDub) {
    badges.push("DUB");
  } else if (item.isSub) {
    badges.push("SUB");
  }

  return {
    uid,
    name: pickTitle(item),
    kind: mapFormatToKind(item.format),
    visuals: {
      cover: pickCover(item.coverImage),
      banner: null,
      wordmark: null,
      net: null,
    },
    badges: badges.slice(0, 2),
    score: normalizeScore(item.meanScore !== undefined ? item.meanScore : item.averageScore),
    releaseYear: null,
    liveNow: false,
    carry: buildCarry(item),
  };
}

function mapHeroItemToSpotlight(item) {
  const uid = getCanonicalSlug(item);
  const badges = [];
  if (item.format) badges.push(String(item.format));
  if (item.status === "RELEASING") {
    badges.push("Airing");
  } else if (item.duration) {
    badges.push(String(item.duration) + "m");
  }

  const summaryRaw = stripHtml(item.description);
  const summary = summaryRaw && summaryRaw.length > 260 ? summaryRaw.slice(0, 257).trim() + "..." : summaryRaw;

  return {
    uid,
    name: pickTitle(item),
    kind: mapFormatToKind(item.format),
    visuals: {
      cover: sanitizeUrl(item.coverImageExtraLarge || item.coverImage),
      banner: sanitizeUrl(item.fanart || item.bannerUrl || item.bannerImage),
      wordmark: sanitizeUrl(item.clearlogo || item.clearLogoUrl || null),
      net: null,
    },
    summary,
    badges: badges.slice(0, 2),
    score: normalizeScore(item.averageScore),
    releaseYear: item.seasonYear ? Number(item.seasonYear) : null,
    liveNow: false,
    carry: buildCarry(item),
  };
}

function mapSearchRestItemToEntryCard(item) {
  const uid = getCanonicalSlug(item);
  const badges = [];
  if (item.type) badges.push(String(item.type));
  if (item.totalEpisodes) badges.push(String(item.totalEpisodes) + " Eps");

  return {
    uid,
    name: pickTitle(item),
    kind: mapFormatToKind(item.type || item.format),
    visuals: {
      cover: sanitizeUrl(item.image || pickCover(item.coverImage)),
      banner: sanitizeUrl(item.cover || item.bannerImage || null),
      wordmark: null,
      net: null,
    },
    badges: badges.slice(0, 2),
    score: normalizeScore(item.rating !== undefined ? item.rating : item.averageScore),
    releaseYear: item.releaseDate ? Number(item.releaseDate) : null,
    liveNow: false,
    carry: buildCarry(item),
  };
}

// ---------------------------------------------------------------------------
// Operation 1: Discovery Surface (fetchFeed)
// ---------------------------------------------------------------------------

export async function fetchFeed(page = 1, token = null) {
  const origin = await getOrigin();
  const includeAdult = await getIncludeAdult();
  const baseFilter = includeAdult ? {} : { isAdult: false };

  const [heroRes, recentRes, trendingRes, popularRes, topRatedRes, moviesRes, dubbedRes] = await Promise.all([
    httpJson(origin + "/api/anime/hero"),
    httpJson(GRAPHQL_BASE + "/api/recent?page=1"),
    queryGraphQL(CATALOG_GQL, {
      filter: baseFilter,
      sort: [{ field: "TRENDING", direction: "DESC" }],
      limit: 20,
      offset: 0,
    }),
    queryGraphQL(CATALOG_GQL, {
      filter: baseFilter,
      sort: [{ field: "POPULARITY", direction: "DESC" }],
      limit: 20,
      offset: 0,
    }),
    queryGraphQL(CATALOG_GQL, {
      filter: baseFilter,
      sort: [{ field: "AVERAGE_SCORE", direction: "DESC" }],
      limit: 20,
      offset: 0,
    }),
    queryGraphQL(CATALOG_GQL, {
      filter: Object.assign({}, baseFilter, { formatIn: ["MOVIE"] }),
      sort: [{ field: "POPULARITY", direction: "DESC" }],
      limit: 20,
      offset: 0,
    }),
    queryGraphQL(CATALOG_GQL, {
      filter: Object.assign({}, baseFilter, { subDubFilter: "DUB" }),
      sort: [{ field: "POPULARITY", direction: "DESC" }],
      limit: 20,
      offset: 0,
    }),
  ]);

  // If every single upstream call failed, propagate the first actionable fault
  const allResponses = [heroRes, recentRes, trendingRes, popularRes, topRatedRes, moviesRes, dubbedRes];
  const anySucceeded = allResponses.some((r) => r && r.ok);
  if (!anySucceeded) {
    const firstFault = allResponses.find((r) => r && r.fault);
    return firstFault ? firstFault.fault : fail("UNREACHABLE", "Failed to load Anidap home feed.", "retry");
  }

  let spotlight = [];
  if (heroRes.ok && heroRes.data) {
    const heroList =
      (heroRes.data.data && Array.isArray(heroRes.data.data.data) && heroRes.data.data.data) ||
      (Array.isArray(heroRes.data.data) && heroRes.data.data) ||
      (Array.isArray(heroRes.data) && heroRes.data) ||
      [];
    spotlight = heroList.filter((i) => getCanonicalSlug(i)).slice(0, 10).map(mapHeroItemToSpotlight);
  }

  const shelves = [];

  if (recentRes.ok && recentRes.data && Array.isArray(recentRes.data.results)) {
    const entries = recentRes.data.results
      .filter((r) => (includeAdult || !r.isAdult) && getCanonicalSlug(r))
      .slice(0, 24)
      .map(mapRecentItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "recent_episodes",
        heading: "Recently Updated",
        cardStyle: "portrait",
        expandable: true,
        carry: { preset: "recent" },
        entries,
      });
    }
  }

  if (trendingRes.ok && trendingRes.data && trendingRes.data.catalogAnime) {
    const entries = (trendingRes.data.catalogAnime.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "trending_now",
        heading: "Trending Now",
        cardStyle: "portrait",
        expandable: true,
        carry: { sort: "TRENDING" },
        entries,
      });
    }
  }

  if (popularRes.ok && popularRes.data && popularRes.data.catalogAnime) {
    const entries = (popularRes.data.catalogAnime.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "popular_all_time",
        heading: "Popular All Time",
        cardStyle: "portrait",
        expandable: true,
        carry: { sort: "POPULARITY" },
        entries,
      });
    }
  }

  if (topRatedRes.ok && topRatedRes.data && topRatedRes.data.catalogAnime) {
    const entries = (topRatedRes.data.catalogAnime.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "top_rated",
        heading: "Top Rated",
        cardStyle: "portrait",
        expandable: true,
        carry: { sort: "AVERAGE_SCORE" },
        entries,
      });
    }
  }

  if (moviesRes.ok && moviesRes.data && moviesRes.data.catalogAnime) {
    const entries = (moviesRes.data.catalogAnime.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "top_movies",
        heading: "Anime Movies",
        cardStyle: "portrait",
        expandable: true,
        carry: { format: "MOVIE", sort: "POPULARITY" },
        entries,
      });
    }
  }

  if (dubbedRes.ok && dubbedRes.data && dubbedRes.data.catalogAnime) {
    const entries = (dubbedRes.data.catalogAnime.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    if (entries.length > 0) {
      shelves.push({
        shelfId: "top_dubbed",
        heading: "Popular English Dub",
        cardStyle: "portrait",
        expandable: true,
        carry: { audio: "DUB", sort: "POPULARITY" },
        entries,
      });
    }
  }

  const shortcuts = [
    { shelfId: "recent_episodes", label: "Recent", carry: { preset: "recent" } },
    { shelfId: "top_movies", label: "Movies", carry: { format: "MOVIE", sort: "POPULARITY" } },
    { shelfId: "cat_tv", label: "TV Series", carry: { format: "TV", sort: "TRENDING" } },
    { shelfId: "top_dubbed", label: "English Dub", carry: { audio: "DUB", sort: "POPULARITY" } },
    { shelfId: "genre_action", label: "Action", carry: { genre: "Action", sort: "POPULARITY" } },
    { shelfId: "genre_fantasy", label: "Fantasy", carry: { genre: "Fantasy", sort: "POPULARITY" } },
    { shelfId: "genre_romance", label: "Romance", carry: { genre: "Romance", sort: "POPULARITY" } },
  ];

  return ok(
    {
      spotlight,
      shortcuts,
      shelves,
    },
    {
      current: Number(page) || 1,
      hasMore: false,
      token: null,
    }
  );
}

// ---------------------------------------------------------------------------
// Operation 2: Unified Catalog & Search (queryCatalog)
// ---------------------------------------------------------------------------

export async function queryCatalog(request = {}) {
  const page = Math.max(1, Number(request.page) || 1);
  const keyword = typeof request.keyword === "string" ? request.keyword.trim() : "";
  const shelfId = request.shelfId || null;
  const carry = request.carry && typeof request.carry === "object" ? request.carry : {};
  const filters = request.filters && typeof request.filters === "object" ? request.filters : {};
  const includeAdult = await getIncludeAdult();

  // Special case: Recently Updated Episodes shelf (when no extra filters or keyword applied)
  const hasExplicitFilters =
    Object.keys(filters).some((k) => Array.isArray(filters[k]) && filters[k].length > 0);
  if (!keyword && !hasExplicitFilters && (shelfId === "recent_episodes" || carry.preset === "recent")) {
    const recentRes = await httpJson(GRAPHQL_BASE + "/api/recent?page=" + page);
    if (!recentRes.ok) return recentRes.fault;
    const rawResults = (recentRes.data && recentRes.data.results) || [];
    const entries = rawResults
      .filter((r) => (includeAdult || !r.isAdult) && getCanonicalSlug(r))
      .map(mapRecentItemToEntryCard);
    return ok(
      {
        entries,
        facets: CATALOG_FACETS,
      },
      {
        current: page,
        hasMore: Boolean(recentRes.data && recentRes.data.hasNextPage),
        token: null,
        totalItems: null,
      }
    );
  }

  // Build GraphQL filter object
  const gqlFilter = {};
  if (!includeAdult) {
    gqlFilter.isAdult = false;
  }
  if (keyword) {
    gqlFilter.query = keyword;
  }

  // Merge shelf/shortcut carry defaults with explicit user filters
  const genres = Array.isArray(filters.genre) && filters.genre.length > 0
    ? filters.genre.slice()
    : carry.genre
      ? [String(carry.genre)]
      : [];
  if (genres.length > 0) gqlFilter.genres = genres;

  const formats = Array.isArray(filters.format) && filters.format.length > 0
    ? filters.format.slice()
    : carry.format
      ? [String(carry.format)]
      : shelfId === "top_movies"
        ? ["MOVIE"]
        : shelfId === "cat_tv"
          ? ["TV"]
          : [];
  if (formats.length > 0) gqlFilter.formatIn = formats;

  const statuses = Array.isArray(filters.status) && filters.status.length > 0 ? filters.status.slice() : [];
  if (statuses.length > 0) gqlFilter.statusIn = statuses;

  const seasons = Array.isArray(filters.season) && filters.season.length > 0 ? filters.season.slice() : [];
  if (seasons.length > 0) gqlFilter.seasonIn = seasons;

  const audioChoice =
    (Array.isArray(filters.audio) && filters.audio[0]) ||
    carry.audio ||
    (shelfId === "top_dubbed" ? "DUB" : null);
  if (audioChoice && audioChoice !== "ANY") {
    gqlFilter.subDubFilter = String(audioChoice).toUpperCase();
  }

  let sortField =
    (Array.isArray(filters.sort) && filters.sort[0]) ||
    carry.sort ||
    (shelfId === "popular_all_time"
      ? "POPULARITY"
      : shelfId === "top_rated"
        ? "AVERAGE_SCORE"
        : keyword
          ? "POPULARITY"
          : "TRENDING");

  const validSortFields = {
    POPULARITY: true,
    TRENDING: true,
    AVERAGE_SCORE: true,
    MEAN_SCORE: true,
    FAVOURITES: true,
    SEASON_YEAR: true,
    UPDATED_AT: true,
    CREATED_AT: true,
    TITLE_ENGLISH: true,
  };
  if (!validSortFields[sortField]) sortField = "TRENDING";

  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  const gqlRes = await queryGraphQL(CATALOG_GQL, {
    filter: gqlFilter,
    sort: [{ field: sortField, direction: "DESC" }],
    limit: CATALOG_PAGE_SIZE,
    offset,
  });

  if (gqlRes.ok && gqlRes.data && gqlRes.data.catalogAnime) {
    const cat = gqlRes.data.catalogAnime;
    const entries = (cat.items || [])
      .filter((i) => getCanonicalSlug(i))
      .map(mapCatalogItemToEntryCard);
    return ok(
      {
        entries,
        facets: CATALOG_FACETS,
      },
      {
        current: cat.currentPage || page,
        hasMore: Boolean(cat.hasNextPage),
        token: null,
        totalItems: typeof cat.totalCount === "number" ? cat.totalCount : null,
      }
    );
  }

  // Fallback to REST search when searching by keyword if GraphQL fails
  if (keyword) {
    const origin = await getOrigin();
    const restRes = await httpJson(origin + "/api/anime/search?q=" + encodeURIComponent(keyword));
    if (restRes.ok && restRes.data && Array.isArray(restRes.data.results)) {
      const entries = restRes.data.results
        .filter((i) => getCanonicalSlug(i))
        .map(mapSearchRestItemToEntryCard);
      return ok(
        {
          entries,
          facets: CATALOG_FACETS,
        },
        {
          current: restRes.data.currentPage || page,
          hasMore: Boolean(restRes.data.hasNextPage),
          token: null,
          totalItems: null,
        }
      );
    }
  }

  return gqlRes.fault || fail("UNREACHABLE", "Unable to query Anidap catalog.", "retry");
}

// ---------------------------------------------------------------------------
// Episode Unit Mapper
// ---------------------------------------------------------------------------

function mapEpisodeToUnit(ep, slug, anilistId) {
  const num = Number(ep.number);
  const epIndex = isFinite(num) && num > 0 ? num : 1;
  const titles = ep.titles && typeof ep.titles === "object" ? ep.titles : {};
  const epName =
    (typeof titles.en === "string" && titles.en.trim()) ||
    (typeof titles["x-jat"] === "string" && titles["x-jat"].trim()) ||
    (typeof ep.title === "string" && ep.title.trim()) ||
    null;

  const badges = [];
  if (ep.hasSub) badges.push("SUB");
  if (ep.hasDub) badges.push("DUB");

  let airDate = null;
  if (typeof ep.airDateUtc === "string" && ep.airDateUtc.length >= 10) {
    airDate = ep.airDateUtc.slice(0, 10);
  }

  const carry = {
    slug: String(slug),
    epNum: String(epIndex),
  };
  if (anilistId) carry.anilistId = String(anilistId);

  return {
    unitId: String(slug) + "::" + String(epIndex),
    index: epIndex,
    absoluteIndex: epIndex,
    name: epName,
    visuals: ep.img
      ? {
          thumb: sanitizeUrl(ep.img),
          net: null,
        }
      : null,
    synopsis: stripHtml(ep.description),
    runtimeMin: ep.length ? Number(ep.length) : null,
    airDate,
    flags: {
      upcoming: false,
      filler: Boolean(ep.isFiller),
      recap: false,
      special: false,
    },
    badges,
    carry,
    net: null,
  };
}

// ---------------------------------------------------------------------------
// Operation 3: Entry Profile (fetchProfile)
// ---------------------------------------------------------------------------

const ANIME_PROFILE_GQL = `query AnimeById($id: String, $anilistId: Int) {
  anime(id: $id, anilistId: $anilistId) {
    id
    anilistId
    malId
    tmdbId
    titleRomaji
    titleEnglish
    titles
    coverImage
    bannerImage
    backdropUrl
    description
    episodeCount
    status
    genres
    format
    seasonYear
    averageScore
    duration
    countryOfOrigin
    trailerId
  }
}`;

export async function fetchProfile(uid, carry = {}, net = null) {
  const origin = await getOrigin();
  const safeCarry = carry && typeof carry === "object" ? carry : {};
  const lookupId = safeCarry.slug || uid || safeCarry.anilistId;

  if (!lookupId) {
    return fail("EXPIRED_ROUTE", "Missing anime identifier.", "notify_only");
  }

  let data = null;
  const detailsRes = await httpJson(origin + "/api/anime/" + encodeURIComponent(String(lookupId)));
  if (detailsRes.ok) {
    data = detailsRes.data && detailsRes.data.data ? detailsRes.data.data : detailsRes.data;
  } else {
    // Fallback to GraphQL anime() query (also distinguishes missing anime vs outage)
    const isNumeric = /^\d+$/.test(String(lookupId));
    const gqlVars = isNumeric ? { anilistId: parseInt(String(lookupId), 10) } : { id: String(lookupId) };
    const gqlRes = await queryGraphQL(ANIME_PROFILE_GQL, gqlVars);
    if (!gqlRes.ok) {
      return detailsRes.fault || gqlRes.fault;
    }
    data = gqlRes.data ? gqlRes.data.anime : null;
  }

  if (!data || (!data.id && !data.anilistId)) {
    return fail("EXPIRED_ROUTE", "Anime details not found on Anidap.", "notify_only");
  }

  const canonicalSlug = getCanonicalSlug(data);
  const anilistId = data.anilistId !== undefined && data.anilistId !== null ? String(data.anilistId) : null;

  // Fetch episodes from chad.anidap.lol
  const epsRes = await httpJson(CHAD_BASE + "/rest/api/episodes?id=" + encodeURIComponent(canonicalSlug));
  const rawEpisodes =
    epsRes.ok && Array.isArray(epsRes.data)
      ? epsRes.data
      : epsRes.ok && epsRes.data && Array.isArray(epsRes.data.data)
        ? epsRes.data.data
        : [];

  // Sort episodes numerically ascending
  const sortedEpisodes = rawEpisodes.slice().sort((a, b) => Number(a.number || 0) - Number(b.number || 0));

  // Build aliases
  const titleName = pickTitle(data);
  const aliasesSet = new Set();
  const rawAliases = [
    data.titleRomaji,
    data.romajiTitle,
    data.titleEnglish,
    data.englishTitle,
    data.nativeTitle,
    data.titles ? data.titles.ja : null,
  ];
  for (let i = 0; i < rawAliases.length; i++) {
    const a = rawAliases[i];
    if (typeof a === "string" && a.trim() && a.trim().toLowerCase() !== titleName.toLowerCase()) {
      aliasesSet.add(a.trim());
    }
  }
  const aliases = Array.from(aliasesSet);

  // Pick wordmark (prefer clearLogoUrl or US PNG logo)
  let wordmark = sanitizeUrl(data.clearLogoUrl || data.clearlogo || null);
  if (!wordmark && Array.isArray(data.logos) && data.logos.length > 0) {
    const usPng = data.logos.find((l) => l && l.src && l.iso3166_1 === "US" && !String(l.src).endsWith(".svg"));
    const anyPng = data.logos.find((l) => l && l.src && !String(l.src).endsWith(".svg"));
    wordmark = sanitizeUrl((usPng && usPng.src) || (anyPng && anyPng.src) || null);
  }

  // Languages inferred from episode sub/dub availability
  const hasSub = sortedEpisodes.some((e) => e && e.hasSub);
  const hasDub = sortedEpisodes.some((e) => e && e.hasDub);
  const languages = [];
  if (hasSub || sortedEpisodes.length > 0) languages.push("Japanese");
  if (hasDub) languages.push("English");

  const badges = [];
  if (data.format) badges.push(String(data.format));
  if (hasSub) badges.push("SUB");
  if (hasDub) badges.push("DUB");

  const studios = Array.isArray(data.studios) ? data.studios : [];
  const creator =
    studios.length > 0
      ? typeof studios[0] === "string"
        ? studios[0]
        : studios[0] && studios[0].name
          ? studios[0].name
          : null
      : null;

  let previewVideoUri = null;
  if (data.trailer && data.trailer.id && String(data.trailer.site || "").toLowerCase() === "youtube") {
    previewVideoUri = "https://www.youtube.com/watch?v=" + String(data.trailer.id);
  } else if (data.trailerId) {
    previewVideoUri = "https://www.youtube.com/watch?v=" + String(data.trailerId);
  }

  const crossRefs = {};
  if (anilistId) crossRefs.anilist = anilistId;
  if (data.malId || data.idMal) crossRefs.mal = String(data.malId || data.idMal);
  if (data.tmdbId) crossRefs.tmdb = String(data.tmdbId);

  const credits = (Array.isArray(data.characters) ? data.characters : [])
    .slice(0, 15)
    .map((ch) => {
      const va = ch && ch.voiceActor ? ch.voiceActor : null;
      return {
        person: (va && va.name) || (ch && ch.name) || "Unknown",
        character: (ch && ch.name) || null,
        photo: sanitizeUrl((va && va.image) || (ch && ch.image) || null),
      };
    });

  const relations = (Array.isArray(data.relations) ? data.relations : [])
    .filter((rel) => rel && getCanonicalSlug(rel))
    .slice(0, 12)
    .map((rel) => ({
      relationship: formatRelationLabel(rel.relation),
      entry: {
        uid: getCanonicalSlug(rel),
        name: pickTitle(rel),
        kind: mapFormatToKind(rel.format || rel.type),
        visuals: {
          cover: pickCover(rel.coverImage || rel.coverImages),
          banner: null,
          wordmark: null,
          net: null,
        },
        badges: rel.format ? [String(rel.format)] : [],
        carry: buildCarry(rel),
      },
    }));

  const similar = (Array.isArray(data.recommendations) ? data.recommendations : [])
    .filter((rec) => rec && getCanonicalSlug(rec))
    .slice(0, 15)
    .map((rec) => ({
      uid: getCanonicalSlug(rec),
      name: pickTitle(rec),
      kind: mapFormatToKind(rec.format),
      visuals: {
        cover: pickCover(rec.coverImage || rec.coverImages),
        banner: null,
        wordmark: null,
        net: null,
      },
      badges: rec.format && rec.format !== "ANIME" ? [String(rec.format)] : [],
      score: normalizeScore(rec.averageScore),
      releaseYear: rec.seasonYear ? Number(rec.seasonYear) : null,
      carry: buildCarry(rec),
    }));

  // Structure-driven playable layout: Movie -> directTarget; Series -> groups (chunked if > 100 eps)
  const isMovieFormat = String(data.format || "").toUpperCase() === "MOVIE";
  let directTarget = null;
  const groups = [];

  if (isMovieFormat && sortedEpisodes.length <= 1) {
    const epNum = sortedEpisodes.length === 1 && sortedEpisodes[0].number ? Number(sortedEpisodes[0].number) : 1;
    const targetCarry = {
      slug: canonicalSlug,
      epNum: String(epNum),
      isMovie: "true",
    };
    if (anilistId) targetCarry.anilistId = anilistId;
    directTarget = {
      targetId: canonicalSlug + "::" + String(epNum),
      carry: targetCarry,
      net: null,
    };
  } else if (sortedEpisodes.length > 0) {
    if (sortedEpisodes.length <= EPISODE_CHUNK_SIZE) {
      groups.push({
        groupId: "grp_1",
        index: 1,
        label: "Episodes",
        unitCount: sortedEpisodes.length,
        deferredUnits: false,
        carry: {
          slug: canonicalSlug,
          startIndex: "0",
          endIndex: String(sortedEpisodes.length),
        },
        units: sortedEpisodes.map((ep) => mapEpisodeToUnit(ep, canonicalSlug, anilistId)),
      });
    } else {
      // Chunk large anime (e.g., One Piece 1180+ episodes) into 100-episode groups
      // First chunk is eagerly loaded; subsequent chunks use deferredUnits + fetchUnits
      const totalChunks = Math.ceil(sortedEpisodes.length / EPISODE_CHUNK_SIZE);
      for (let c = 0; c < totalChunks; c++) {
        const startIdx = c * EPISODE_CHUNK_SIZE;
        const endIdx = Math.min(sortedEpisodes.length, startIdx + EPISODE_CHUNK_SIZE);
        const slice = sortedEpisodes.slice(startIdx, endIdx);
        const firstEpNum = slice[0] && slice[0].number ? slice[0].number : startIdx + 1;
        const lastEpNum = slice[slice.length - 1] && slice[slice.length - 1].number ? slice[slice.length - 1].number : endIdx;

        const grpCarry = {
          slug: canonicalSlug,
          startIndex: String(startIdx),
          endIndex: String(endIdx),
        };
        if (anilistId) grpCarry.anilistId = anilistId;

        groups.push({
          groupId: "grp_" + String(c + 1),
          index: c + 1,
          label: "Episodes " + String(firstEpNum) + "–" + String(lastEpNum),
          unitCount: slice.length,
          deferredUnits: c > 0,
          carry: grpCarry,
          units: c === 0 ? slice.map((ep) => mapEpisodeToUnit(ep, canonicalSlug, anilistId)) : [],
        });
      }
    }
  } else if (data.episodes === 1 || data.episodeCount === 1) {
    // Fallback direct target if episode list failed temporarily for a single-episode title
    directTarget = {
      targetId: canonicalSlug + "::1",
      carry: { slug: canonicalSlug, epNum: "1" },
      net: null,
    };
  }

  return ok({
    uid: canonicalSlug,
    name: titleName,
    aliases,
    kind: mapFormatToKind(data.format),
    availability: "stream_only",
    visuals: {
      cover: pickCover(data.coverImage || data.coverImages),
      banner: sanitizeUrl(data.backdropUrl || data.bannerImage || data.bannerUrl || null),
      wordmark,
      net: null,
    },
    tagline: null,
    synopsis: stripHtml(data.description || data.synopsis),
    facts: {
      releaseYear: data.seasonYear || data.year ? Number(data.seasonYear || data.year) : null,
      releaseDate: typeof data.startDate === "string" ? data.startDate : null,
      state: formatStatusLabel(data.status),
      maturity: null,
      score: normalizeScore(data.averageScore),
      scoreVotes: null,
      runtimeMin: data.duration ? Number(data.duration) : null,
      country: data.countryOfOrigin || null,
      creator,
      languages,
    },
    genres: Array.isArray(data.genres) ? data.genres : [],
    badges,
    previewVideoUri,
    crossRefs: Object.keys(crossRefs).length > 0 ? crossRefs : null,
    credits,
    directTarget,
    liveSchedule: null,
    groups,
    relations,
    similar,
  });
}

// ---------------------------------------------------------------------------
// Operation 4: Deferred Unit Loader (fetchUnits)
// ---------------------------------------------------------------------------

export async function fetchUnits(groupId, page = 1, token = null, carry = {}) {
  const safeCarry = carry && typeof carry === "object" ? carry : {};
  const slug = safeCarry.slug;
  const anilistId = safeCarry.anilistId || null;

  if (!slug) {
    return fail("EXPIRED_ROUTE", "Missing anime slug for deferred episode group.", "notify_only");
  }

  const epsRes = await httpJson(CHAD_BASE + "/rest/api/episodes?id=" + encodeURIComponent(String(slug)));
  if (!epsRes.ok) return epsRes.fault;

  const rawEpisodes = Array.isArray(epsRes.data)
    ? epsRes.data
    : epsRes.data && Array.isArray(epsRes.data.data)
      ? epsRes.data.data
      : [];

  const sortedEpisodes = rawEpisodes.slice().sort((a, b) => Number(a.number || 0) - Number(b.number || 0));

  let startIdx = safeCarry.startIndex !== undefined ? parseInt(String(safeCarry.startIndex), 10) : NaN;
  let endIdx = safeCarry.endIndex !== undefined ? parseInt(String(safeCarry.endIndex), 10) : NaN;

  if (!isFinite(startIdx) || !isFinite(endIdx)) {
    const p = Math.max(1, Number(page) || 1);
    startIdx = (p - 1) * EPISODE_CHUNK_SIZE;
    endIdx = Math.min(sortedEpisodes.length, startIdx + EPISODE_CHUNK_SIZE);
  }

  const slice = sortedEpisodes.slice(startIdx, endIdx);
  const units = slice.map((ep) => mapEpisodeToUnit(ep, slug, anilistId));

  return ok(
    {
      groupId: String(groupId || "grp_1"),
      units,
    },
    {
      current: Number(page) || 1,
      hasMore: false,
      token: null,
      totalItems: slice.length,
    }
  );
}

// ---------------------------------------------------------------------------
// Media Resolution Helpers
// ---------------------------------------------------------------------------

function parseTarget(targetId, carry) {
  const safeCarry = carry && typeof carry === "object" ? carry : {};
  let slug = safeCarry.slug || null;
  let epNum = safeCarry.epNum || null;

  if ((!slug || !epNum) && typeof targetId === "string" && targetId.indexOf("::") !== -1) {
    const parts = targetId.split("::");
    if (!slug) slug = parts[0];
    if (!epNum) epNum = parts[1];
  }

  return {
    slug: slug ? String(slug) : null,
    epNum: epNum ? String(epNum) : "1",
  };
}

function buildSourceNetPolicy(providerId, rawHeaders, streamUrl) {
  const headers = {};
  if (rawHeaders && typeof rawHeaders === "object") {
    const keys = Object.keys(rawHeaders);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = rawHeaders[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        headers[k] = String(v).trim();
      }
    }
  }

  const hasReferer = Object.keys(headers).some((k) => k.toLowerCase() === "referer");
  if (!hasReferer && HOST_FALLBACK_REFERERS[providerId]) {
    headers.Referer = HOST_FALLBACK_REFERERS[providerId];
  }

  const refererKey = Object.keys(headers).find((k) => k.toLowerCase() === "referer");
  const hasOrigin = Object.keys(headers).some((k) => k.toLowerCase() === "origin");
  if (refererKey && !hasOrigin) {
    const originVal = extractOrigin(headers[refererKey]);
    if (originVal) headers.Origin = originVal;
  }

  const expiresAtSec = extractTokenExpirySec(streamUrl);
  const cookieScope = extractHost(streamUrl);

  return {
    headers,
    cookieScope: cookieScope || null,
    attachCookies: false,
    lockUserAgent: false,
    expiresAtSec,
  };
}

function parseTracksAndThumbnails(rawTracks, fallbackHeaders) {
  const captions = [];
  let storyboardVttUri = null;
  const seen = new Set();

  if (!Array.isArray(rawTracks)) {
    return { captions, storyboardVttUri };
  }

  for (let i = 0; i < rawTracks.length; i++) {
    const t = rawTracks[i];
    if (!t || !t.url) continue;
    const cleanUrl = sanitizeUrl(t.url);
    if (!cleanUrl) continue;

    const kindLower = String(t.kind || "").toLowerCase();
    const labelLower = String(t.label || "").toLowerCase();
    const langLower = String(t.lang || "").toLowerCase();

    if (kindLower === "thumbnails" || labelLower === "thumbnails" || langLower === "thumbnails") {
      if (!storyboardVttUri) storyboardVttUri = cleanUrl;
      continue;
    }

    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    const langCode = normalizeLangCode(t.lang, t.label);
    const label = (t.label && String(t.label).trim()) || (t.lang && String(t.lang).trim()) || langCode.toUpperCase();

    captions.push({
      uri: cleanUrl,
      langCode,
      label,
      syntax: detectCaptionSyntax(cleanUrl),
      defaultTrack: Boolean(t.default),
      forced: false,
      net: fallbackHeaders && Object.keys(fallbackHeaders).length > 0 ? { headers: fallbackHeaders, attachCookies: false } : null,
    });
  }

  return { captions, storyboardVttUri };
}

function parseTimeline(data, storyboardVttUri, storyboardHeaders) {
  const markers = [];
  const chapters = [];

  if (data && data.intro && Number(data.intro.end) > Number(data.intro.start || 0)) {
    markers.push({
      kind: "opening",
      startMs: Math.round(Number(data.intro.start || 0) * 1000),
      endMs: Math.round(Number(data.intro.end) * 1000),
    });
  }

  if (data && data.outro && Number(data.outro.end) > Number(data.outro.start || 0)) {
    markers.push({
      kind: "ending",
      startMs: Math.round(Number(data.outro.start || 0) * 1000),
      endMs: Math.round(Number(data.outro.end) * 1000),
    });
  }

  if (data && Array.isArray(data.chapters)) {
    for (let i = 0; i < data.chapters.length; i++) {
      const ch = data.chapters[i];
      if (!ch) continue;
      const startSec = Number(ch.start || 0);
      const endSec = Number(ch.end || 0);
      const title = String(ch.title || "").trim();
      const lower = title.toLowerCase();

      if (title) {
        chapters.push({
          label: title,
          startMs: Math.round(startSec * 1000),
        });
      }

      if (endSec > startSec) {
        if (/intro|opening|\bop\b/i.test(lower) && !markers.some((m) => m.kind === "opening")) {
          markers.push({
            kind: "opening",
            startMs: Math.round(startSec * 1000),
            endMs: Math.round(endSec * 1000),
          });
        } else if (/outro|ending|\bed\b/i.test(lower) && !markers.some((m) => m.kind === "ending")) {
          markers.push({
            kind: "ending",
            startMs: Math.round(startSec * 1000),
            endMs: Math.round(endSec * 1000),
          });
        } else if (/recap/i.test(lower) && !markers.some((m) => m.kind === "recap")) {
          markers.push({
            kind: "recap",
            startMs: Math.round(startSec * 1000),
            endMs: Math.round(endSec * 1000),
          });
        }
      }
    }
  }

  if (markers.length === 0 && chapters.length === 0 && !storyboardVttUri) {
    return null;
  }

  return {
    markers,
    chapters,
    storyboard: storyboardVttUri
      ? {
          vttUri: storyboardVttUri,
          net: storyboardHeaders && Object.keys(storyboardHeaders).length > 0 ? { headers: storyboardHeaders } : null,
        }
      : null,
  };
}

function getHostDisplayName(providerId) {
  const key = String(providerId || "").toLowerCase();
  if (HOST_DISPLAY_NAMES[key]) return HOST_DISPLAY_NAMES[key];
  return key ? key[0].toUpperCase() + key.slice(1) : "Server";
}

function computePriority(providerId, variant, isDefault, preferredAudio) {
  const key = String(providerId || "").toLowerCase();
  let score = HOST_PRIORITY_RANK[key] || 50;
  if (isDefault) score += 10;
  if (variant === preferredAudio) score += 20;
  return score;
}

async function fetchProviderBundle(slug, epNum, providerId, variant, priority) {
  const url =
    CHAD_BASE +
    "/rest/api/sources?id=" +
    encodeURIComponent(slug) +
    "&epNum=" +
    encodeURIComponent(epNum) +
    "&type=" +
    encodeURIComponent(variant) +
    "&providerId=" +
    encodeURIComponent(providerId);

  const res = await httpJson(url, { timeoutMs: 12000 });
  if (!res.ok) {
    log("warn", "Provider " + providerId + " (" + variant + ") failed: " + (res.fault ? res.fault.fault.summary : "error"));
    return { ok: false, fault: res.fault };
  }

  const root = res.data;
  const payload = root && root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : root;
  const rawSources = payload && Array.isArray(payload.sources) ? payload.sources : [];
  if (rawSources.length === 0) {
    return { ok: false, fault: null };
  }

  const hostName = getHostDisplayName(providerId);
  const audioTag = variant === "dub" ? "English Dub" : "Japanese Sub";
  const rawTracks = Array.isArray(payload.tracks)
    ? payload.tracks
    : Array.isArray(payload.subtitles)
      ? payload.subtitles
      : [];

  const firstCleanUrl = sanitizeUrl(rawSources[0].url);
  const primaryNet = buildSourceNetPolicy(providerId, payload.headers, firstCleanUrl);
  const { captions, storyboardVttUri } = parseTracksAndThumbnails(rawTracks, primaryNet.headers);
  const timeline = parseTimeline(payload, storyboardVttUri, primaryNet.headers);

  const sidecarAudio = (Array.isArray(payload.audio) ? payload.audio : [])
    .filter((a) => a && a.url)
    .map((a, idx) => ({
      uri: sanitizeUrl(a.url),
      langCode: normalizeLangCode(a.lang || a.language, a.label),
      label: a.label || a.lang || "Audio " + String(idx + 1),
      codec: a.codec || "aac",
      defaultTrack: Boolean(a.default || idx === 0),
      net: primaryNet,
    }));

  const mappedSources = [];
  for (let i = 0; i < rawSources.length; i++) {
    const s = rawSources[i];
    const cleanUrl = sanitizeUrl(s && s.url);
    if (!cleanUrl) continue;

    const qualityTag = s.quality ? String(s.quality) : "Auto";
    const container = detectContainer(cleanUrl, s.type, s.isM3U8);
    const sourceNet = buildSourceNetPolicy(providerId, payload.headers, cleanUrl);
    const suffix = rawSources.length > 1 ? "_" + String(i + 1) : "";

    mappedSources.push({
      sourceId: "src_" + String(providerId) + "_" + String(variant) + suffix,
      hostName,
      displayLabel:
        hostName +
        " • " +
        (variant === "dub" ? "DUB" : "SUB") +
        (qualityTag && qualityTag.toLowerCase() !== "auto" ? " • " + qualityTag : " • Auto"),
      resolutionState: "ready",
      uri: cleanUrl,
      container,
      qualityTag,
      video: null,
      audioTag,
      variant,
      priority: priority - i,
      canDirectSave: container === "hls" || container === "mp4" || container === "mkv",
      net: sourceNet,
      sidecarAudio,
      captions,
      encryption: null,
      decoderHint: "auto",
    });
  }

  return {
    ok: mappedSources.length > 0,
    sources: mappedSources,
    captions,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// Operation 5: Media Resolution (resolveMedia)
// ---------------------------------------------------------------------------

export async function resolveMedia(targetId, carry = {}, net = null) {
  const { slug, epNum } = parseTarget(targetId, carry);
  if (!slug) {
    return fail("EXPIRED_ROUTE", "Missing anime identifier for media resolution.", "notify_only");
  }

  const preferredAudio = await getPreferredAudio();

  const serversUrl =
    CHAD_BASE +
    "/rest/api/servers?id=" +
    encodeURIComponent(slug) +
    "&epNum=" +
    encodeURIComponent(epNum);

  const serversRes = await httpJson(serversUrl);
  if (!serversRes.ok) return serversRes.fault;

  const srvData =
    serversRes.data && serversRes.data.data && (serversRes.data.data.subProviders || serversRes.data.data.dubProviders)
      ? serversRes.data.data
      : serversRes.data || {};

  const normalizeProviderList = (list, variant) => {
    if (!Array.isArray(list)) return [];
    const seenIds = new Set();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const id = typeof item === "string" ? item : item && item.id ? String(item.id) : null;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const isDef = Boolean(item && typeof item === "object" && item.default);
      out.push({
        id,
        variant,
        isDefault: isDef,
        tip: item && typeof item === "object" && item.tip ? String(item.tip) : null,
        priority: computePriority(id, variant, isDef, preferredAudio),
      });
    }
    return out.sort((a, b) => b.priority - a.priority);
  };

  const subCandidates = normalizeProviderList(srvData.subProviders, "sub");
  const dubCandidates = normalizeProviderList(srvData.dubProviders, "dub");

  if (subCandidates.length === 0 && dubCandidates.length === 0) {
    return fail("NOTHING_RESOLVABLE", "No streaming servers available for this episode.", "switch_connector");
  }

  // Pick eager candidates: top 2 of preferred variant + top 1 of secondary variant
  const primaryList = preferredAudio === "dub" ? dubCandidates : subCandidates;
  const secondaryList = preferredAudio === "dub" ? subCandidates : dubCandidates;

  const eagerCandidates = [];
  const deferredCandidates = [];

  for (let i = 0; i < primaryList.length; i++) {
    if (i < 2) eagerCandidates.push(primaryList[i]);
    else deferredCandidates.push(primaryList[i]);
  }
  for (let i = 0; i < secondaryList.length; i++) {
    if (i < 1) eagerCandidates.push(secondaryList[i]);
    else deferredCandidates.push(secondaryList[i]);
  }

  // Resolve eager candidates in parallel
  const eagerResults = await Promise.all(
    eagerCandidates.map((cand) => fetchProviderBundle(slug, epNum, cand.id, cand.variant, cand.priority))
  );

  const readySources = [];
  const allCaptions = [];
  let bestTimeline = null;

  const ingestBundle = (bundle) => {
    if (!bundle || !bundle.ok) return;
    for (let i = 0; i < bundle.sources.length; i++) {
      readySources.push(bundle.sources[i]);
    }
    for (let i = 0; i < bundle.captions.length; i++) {
      allCaptions.push(bundle.captions[i]);
    }
    if (bundle.timeline) {
      if (!bestTimeline) {
        bestTimeline = bundle.timeline;
      } else {
        // Merge any missing opening/ending markers or storyboard
        for (let m = 0; m < bundle.timeline.markers.length; m++) {
          const mk = bundle.timeline.markers[m];
          if (!bestTimeline.markers.some((x) => x.kind === mk.kind)) {
            bestTimeline.markers.push(mk);
          }
        }
        if (!bestTimeline.storyboard && bundle.timeline.storyboard) {
          bestTimeline.storyboard = bundle.timeline.storyboard;
        }
      }
    }
  };

  for (let i = 0; i < eagerResults.length; i++) {
    ingestBundle(eagerResults[i]);
  }

  // Fallback: if all eager servers failed, try deferred candidates until we get at least one ready stream
  const remainingDeferred = [];
  if (readySources.length === 0 && deferredCandidates.length > 0) {
    for (let i = 0; i < deferredCandidates.length; i++) {
      const cand = deferredCandidates[i];
      if (readySources.length === 0) {
        const res = await fetchProviderBundle(slug, epNum, cand.id, cand.variant, cand.priority);
        ingestBundle(res);
      } else {
        remainingDeferred.push(cand);
      }
    }
  } else {
    for (let i = 0; i < deferredCandidates.length; i++) {
      remainingDeferred.push(deferredCandidates[i]);
    }
  }

  if (readySources.length === 0) {
    return fail("NOTHING_RESOLVABLE", "All servers failed to extract a playable stream.", "switch_connector");
  }

  // Append remaining servers as deferred sources for fast lazy mirror switching
  const deferredSources = remainingDeferred.map((cand) => {
    const hostName = getHostDisplayName(cand.id);
    return {
      sourceId: "src_" + String(cand.id) + "_" + String(cand.variant),
      hostName,
      displayLabel: hostName + " • " + (cand.variant === "dub" ? "DUB" : "SUB") + " (Tap to Load)",
      resolutionState: "deferred",
      uri: null,
      container: "hls",
      qualityTag: "Auto",
      audioTag: cand.variant === "dub" ? "English Dub" : "Japanese Sub",
      variant: cand.variant,
      priority: cand.priority,
      canDirectSave: true,
      resolverCarry: {
        slug,
        epNum,
        providerId: cand.id,
        variant: cand.variant,
        priority: String(cand.priority),
      },
    };
  });

  // Deduplicate sharedCaptions by langCode + label (preferring English default)
  const sharedCaptions = [];
  const capSeen = new Set();
  for (let i = 0; i < allCaptions.length; i++) {
    const c = allCaptions[i];
    const key = c.langCode + "::" + c.label.toLowerCase();
    if (capSeen.has(key)) continue;
    capSeen.add(key);
    sharedCaptions.push(c);
  }

  const allSources = readySources.concat(deferredSources).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return ok({
    sources: allSources,
    acquisitions: [],
    sharedCaptions,
    timeline: bestTimeline,
    playbackHints: {
      isLive: false,
      dvrWindowSec: null,
      resumeOffsetMs: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Operation 6: Deferred Source Resolver (resolveDeferredSource)
// ---------------------------------------------------------------------------

export async function resolveDeferredSource(sourceId, resolverCarry = {}) {
  const safeCarry = resolverCarry && typeof resolverCarry === "object" ? resolverCarry : {};
  const slug = safeCarry.slug;
  const epNum = safeCarry.epNum || "1";
  const providerId = safeCarry.providerId;
  const variant = safeCarry.variant || "sub";
  const priority = safeCarry.priority ? Number(safeCarry.priority) : 60;

  if (!slug || !providerId) {
    return fail("EXPIRED_ROUTE", "Missing deferred mirror context.", "notify_only");
  }

  const bundle = await fetchProviderBundle(String(slug), String(epNum), String(providerId), String(variant), priority);
  if (!bundle.ok || !bundle.sources || bundle.sources.length === 0) {
    return fail("NOTHING_RESOLVABLE", "Mirror " + getHostDisplayName(providerId) + " is currently unavailable.", "retry");
  }

  const primary = bundle.sources[0];
  primary.sourceId = sourceId || primary.sourceId;

  return ok({
    source: primary,
  });
}
