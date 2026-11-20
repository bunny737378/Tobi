# Modular Media Connector Protocol (MMCP v1.0)

---

## Core Design Principles

Most media connector architectures break down when one source returns rich metadata while another scrapes minimal HTML, or when links require Cloudflare tokens, split audio tracks, or download-only handoffs. MMCP solves this with five foundational rules:

1. **Uniform Response Envelope:** Every JavaScript call returns the exact same outer envelope (`ok`, `payload`, `paging`, `fault`), so the Kotlin engine handles errors, retries, and pagination in one central pipeline before touching any payload.
2. **Structure-Driven, Not Label-Driven:** Content labels like `movie` or `series` are completely optional. The UI decides how to render a page strictly from data structure (direct playable target vs. grouped units vs. acquisition-only).
3. **First-Class Network & Session Context (`NetPolicy`):** Per-request headers, per-item tokens, cookie-domain scoping, and Cloudflare User-Agent locking are native schema fields—never hacked into opaque strings.
4. **Dual-Channel Media Resolution:** Playback (`sources`) and File Acquisition (`acquisitions`) are equal, independent channels. Download-only providers work natively without triggering fake "No Streams" errors.
5. **Lazy & Deferred Execution:** Both large episode lists (`fetchUnits`) and slow multi-mirror embed scrapers (`resolveDeferredSource`) support on-demand resolution so pages load instantly.

---

## 1. The Universal Response Envelope

Every exported function in a JavaScript connector **must** return this outer structure:

```json
{
  "ok": true,
  "payload": {},
  "paging": null,
  "fault": null
}
```

### Standard `paging` Object (Optional)
Used uniformly across Discovery, Catalog/Search, and Lazy Unit lists.

```json
{
  "current": 1,
  "hasMore": true,
  "token": "cursor_abc987",
  "totalItems": 340
}
```
* If `token` is non-null, the host passes `token` on the next page request; otherwise it increments `current`.
* If `paging` is `null` or `hasMore` is `false`, pagination terminates cleanly.

### Standard `fault` Object (When `ok` is `false`)
Maps provider failures directly to native Kotlin recovery actions.

```json
{
  "ok": false,
  "payload": null,
  "paging": null,
  "fault": {
    "reason": "CHALLENGE_GATE",
    "summary": "Cloudflare verification required before accessing this source.",
    "recovery": "solve_in_webview",
    "targetUri": "https://source.example.com/home",
    "retryAfterSec": 0
  }
}
```

| `reason` | Meaning | Native App Action (`recovery`) |
| :--- | :--- | :--- |
| `UNREACHABLE` | Timeout, DNS failure, HTTP 5xx | `retry` — Display retry button |
| `CHALLENGE_GATE` | Cloudflare / DDoS-Guard / Captcha | `solve_in_webview` — Open WebView at `targetUri`, sync cookies & User-Agent to Session Vault, auto-retry |
| `REGION_LOCKED` | Geo-blocked by upstream host | `notify_only` — Show region/VPN notice |
| `CREDENTIALS_NEEDED` | Missing API key, login, or custom cookie | `open_connector_settings` — Prompt user for connector credentials |
| `EXPIRED_ROUTE` | Item removed or broken link | `notify_only` — Clean unavailable state |
| `NOTHING_RESOLVABLE` | Neither playable sources nor download targets exist | `switch_connector` — Offer instant search in other installed connectors |
| `SCHEMA_DRIFT` | Upstream website layout changed | `notify_only` — Flag connector as needing an update |

---

## 2. Shared Primitives

### A. `NetPolicy` (`net`)
Attachable at the Connector, Visuals, Entry, Source, or Acquisition level. Controls exact HTTP identity and Cloudflare cookie consistency.

```json
{
  "headers": {
    "Referer": "https://source.example.com/",
    "X-Custom-Token": "tok_99182"
  },
  "cookieScope": "source.example.com",
  "attachCookies": true,
  "lockUserAgent": true,
  "expiresAtSec": 1795185600
}
```
* **`attachCookies`:** Defaults to `true`. Instructs OkHttp, Coil (images), the native video player, and the download manager to attach cookies from the shared **Session Vault** for `cookieScope` (or the request host if omitted).
* **`lockUserAgent`:** When `true`, guarantees the exact same `User-Agent` used during a WebView Cloudflare challenge is sent with every subsequent API, image, stream, and download request.
* **`expiresAtSec`:** Unix timestamp in seconds. If playback resumes after expiration, the app silently re-calls `resolveMedia` and restores the exact millisecond timestamp without throwing a `403`.

### B. `Visuals` (`visuals`)
Consolidates artwork and hotlink-protection headers in one place. Every field is optional.

```json
{
  "cover": "https://cdn.example.com/vertical_2x3.jpg",
  "banner": "https://cdn.example.com/wide_16x9.jpg",
  "wordmark": "https://cdn.example.com/title_logo.png",
  "thumb": "https://cdn.example.com/preview.jpg",
  "net": {
    "headers": {
      "Referer": "https://source.example.com/"
    },
    "attachCookies": true
  }
}
```

### C. `EntryCard` (Compact List Representation)
Used inside Shelves, Spotlight banners, Search grids, and Related items. Only `uid` and `name` are strictly required.

```json
{
  "uid": "ent_9042",
  "name": "Dune: Part Two",
  "kind": "movie",
  "visuals": {
    "cover": "https://cdn.example.com/dune2_cover.jpg",
    "banner": "https://cdn.example.com/dune2_banner.jpg",
    "wordmark": null,
    "net": null
  },
  "badges": ["4K HDR", "Dual Audio"],
  "score": 8.6,
  "releaseYear": 2024,
  "liveNow": false,
  "carry": {
    "slug": "dune-part-two-2024",
    "nodeToken": "abc123"
  }
}
```
* **`kind`:** Strictly optional (`null` allowed). Suggested values: `"movie"`, `"show"`, `"anime"`, `"live"`, `"clip"`, `"doc"`. If omitted or `null`, no type label is shown on the card.
* **`badges`:** Flexible array of short pill strings (max 2 rendered on cards). Replaces rigid single-purpose quality/episode fields.
* **`carry`:** Flat `Map<String, String>` passed untouched to `fetchProfile`. Ideal for passing per-item tokens, slugs, mirror IDs, or dynamic referers from list pages to detail pages.

---

## 3. Connector Blueprint (`connector.json`)

Static configuration read when installing or updating a JS connector.

```json
{
  "connectorId": "org.myengine.cinevault",
  "displayName": "CineVault",
  "version": "1.0.0",
  "protocolVersion": 1,
  "maintainer": "author_handle",
  "summary": "Multi-language cinema, series, and direct MKV archive.",
  "iconUri": "https://source.example.com/icon.png",
  "originUrl": "https://source.example.com",
  "locales": ["en", "hi", "ja"],
  "matureContent": false,
  "features": {
    "feed": true,
    "catalogSearch": true,
    "dynamicFilters": true,
    "deferredSources": true,
    "downloads": true,
    "needsWebViewBridge": false
  },
  "defaultNet": {
    "headers": {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "Referer": "https://source.example.com/"
    },
    "attachCookies": true,
    "lockUserAgent": true
  },
  "userConfigSchema": [
    {
      "key": "mirror_domain",
      "label": "Custom Mirror URL",
      "inputType": "url",
      "required": false,
      "defaultValue": "https://source.example.com"
    }
  ]
}
```
* **`userConfigSchema`:** Lets a connector declare optional settings (like custom mirror URLs, API keys, or session cookies) that the Kotlin app renders automatically in a native Settings screen.

---

## 4. Operation 1: Discovery Surface (`fetchFeed`)

Powers the main screen of a connector. Supports rich multi-shelf layouts, spotlight heroes, quick filter chips, or a single flat catalog grid.

### Rich Response Example
```json
{
  "ok": true,
  "payload": {
    "spotlight": [
      {
        "uid": "ent_9042",
        "name": "Dune: Part Two",
        "kind": "movie",
        "visuals": {
          "cover": "https://cdn.example.com/dune2_cover.jpg",
          "banner": "https://cdn.example.com/dune2_banner.jpg",
          "wordmark": "https://cdn.example.com/dune2_logo.png"
        },
        "summary": "Paul Atreides unites with the Fremen on a path of vengeance.",
        "badges": ["4K HDR", "2h 46m"],
        "score": 8.6,
        "releaseYear": 2024,
        "carry": { "slug": "dune-part-two" }
      }
    ],
    "shortcuts": [
      { "shelfId": "cat_movies", "label": "Movies", "carry": { "path": "/movies" } },
      { "shelfId": "cat_anime", "label": "Anime", "carry": { "path": "/anime" } },
      { "shelfId": "cat_live", "label": "Live Sports", "carry": { "path": "/live" } }
    ],
    "shelves": [
      {
        "shelfId": "trending_now",
        "heading": "Trending Now",
        "cardStyle": "portrait",
        "expandable": true,
        "carry": { "path": "/trending" },
        "entries": [
          {
            "uid": "ent_771",
            "name": "Shogun",
            "kind": "show",
            "visuals": { "cover": "https://cdn.example.com/shogun.jpg" },
            "badges": ["1080p", "S1 • E10"],
            "score": 8.7,
            "releaseYear": 2024
          }
        ]
      },
      {
        "shelfId": "live_events",
        "heading": "On Air Right Now",
        "cardStyle": "wide",
        "expandable": false,
        "entries": [
          {
            "uid": "live_19",
            "name": "IND vs AUS — Day 3",
            "kind": "live",
            "visuals": { "banner": "https://cdn.example.com/match.jpg" },
            "badges": ["LIVE", "60fps"],
            "liveNow": true
          }
        ]
      }
    ]
  },
  "paging": { "current": 1, "hasMore": false, "token": null },
  "fault": null
}
```

### Ultra-Minimal Valid Response (Sparse Website)
```json
{
  "ok": true,
  "payload": {
    "shelves": [
      {
        "shelfId": "latest",
        "heading": "Recently Added",
        "cardStyle": "grid",
        "entries": [
          { "uid": "item_1", "name": "Inception", "visuals": { "cover": "https://cdn.example.com/1.jpg" } },
          { "uid": "item_2", "name": "Interstellar" }
        ]
      }
    ]
  },
  "paging": null,
  "fault": null
}
```

**Supported `cardStyle` Values:**
* `"portrait"` — Standard 2:3 movie/show posters (default).
* `"wide"` — 16:9 horizontal cards (live events, episodes, clips).
* `"square"` — 1:1 tiles (channels, collections).
* `"grid"` — Vertical multi-column grid (ideal when a connector only exposes one flat feed).

---

## 5. Operation 2: Unified Catalog & Search (`queryCatalog`)

Replaces separate Search, Category, and Genre endpoints with one unified query contract.

### Input Passed From Kotlin to JS
```json
{
  "keyword": "solo leveling",
  "shelfId": null,
  "filters": {
    "genre": ["action", "fantasy"],
    "sort": ["popular"]
  },
  "page": 1,
  "token": null,
  "carry": {}
}
```

### Response
```json
{
  "ok": true,
  "payload": {
    "entries": [
      {
        "uid": "ani_404",
        "name": "Solo Leveling",
        "kind": "anime",
        "visuals": { "cover": "https://cdn.example.com/solo.jpg" },
        "badges": ["SUB", "DUB"],
        "score": 8.4,
        "releaseYear": 2024
      }
    ],
    "facets": [
      {
        "facetId": "genre",
        "label": "Genre",
        "selection": "multiple",
        "choices": [
          { "value": "action", "label": "Action" },
          { "value": "sci-fi", "label": "Sci-Fi" }
        ]
      },
      {
        "facetId": "sort",
        "label": "Order",
        "selection": "single",
        "choices": [
          { "value": "popular", "label": "Most Popular" },
          { "value": "newest", "label": "Newest First" }
        ]
      }
    ]
  },
  "paging": {
    "current": 1,
    "hasMore": true,
    "token": "eyJvZmZzZXQiOjIwfQ==",
    "totalItems": 180
  },
  "fault": null
}
```
* Omit `facets` (or pass `[]`) when the site has no filters—the filter bar remains hidden.

---

## 6. Operation 3: Entry Profile (`fetchProfile`)

Describes a title and its playable structure. Notice how **`directTarget`**, **`groups`**, and **`availability`** cleanly cover Movies, Multi-Season Shows, 1000+ Episode Anime, Live Channels, Unknown-Type Pages, and Download-Only Archives in a single schema.

### Rich Response Example (Multi-Season Series / Anime)
```json
{
  "ok": true,
  "payload": {
    "uid": "ani_404",
    "name": "Solo Leveling",
    "aliases": ["Ore dake Level Up na Ken"],
    "kind": "anime",
    "availability": "stream_and_download",
    "visuals": {
      "cover": "https://cdn.example.com/solo_cover.jpg",
      "banner": "https://cdn.example.com/solo_banner.jpg",
      "wordmark": "https://cdn.example.com/solo_logo.png",
      "net": null
    },
    "tagline": "Arise.",
    "synopsis": "In a world where hunters fight deadly monsters, the weakest hunter gains a mysterious leveling system.",
    "facts": {
      "releaseYear": 2024,
      "releaseDate": "2024-01-07",
      "state": "Ongoing",
      "maturity": "TV-MA",
      "score": 8.4,
      "scoreVotes": 51000,
      "runtimeMin": 24,
      "country": "Japan",
      "creator": "A-1 Pictures",
      "languages": ["Japanese", "English", "Hindi"]
    },
    "genres": ["Action", "Adventure", "Fantasy"],
    "badges": ["1080p", "SUB", "Hindi Dub"],
    "previewVideoUri": "https://www.youtube.com/watch?v=example",
    "crossRefs": {
      "imdb": "tt21209876",
      "tmdb": "127532",
      "anilist": "151807"
    },
    "credits": [
      {
        "person": "Taito Ban",
        "character": "Sung Jin-Woo",
        "photo": "https://cdn.example.com/taito.jpg"
      }
    ],
    "directTarget": null,
    "liveSchedule": null,
    "groups": [
      {
        "groupId": "grp_s1",
        "index": 1,
        "label": "Season 1",
        "unitCount": 12,
        "deferredUnits": false,
        "carry": {},
        "units": [
          {
            "unitId": "u_404_1_1",
            "index": 1,
            "absoluteIndex": 1,
            "name": "I'm Used to It",
            "visuals": { "thumb": "https://cdn.example.com/ep1.jpg" },
            "synopsis": "Jin-Woo enters a double dungeon with his raid party.",
            "runtimeMin": 24,
            "airDate": "2024-01-07",
            "flags": {
              "upcoming": false,
              "filler": false,
              "recap": false,
              "special": false
            },
            "badges": ["SUB", "DUB"],
            "carry": { "epSlug": "solo-leveling-1" },
            "net": null
          }
        ]
      },
      {
        "groupId": "grp_s2",
        "index": 2,
        "label": "Season 2",
        "unitCount": 13,
        "deferredUnits": true,
        "carry": { "seasonToken": "s2_token" },
        "units": []
      }
    ],
    "relations": [
      {
        "relationship": "Sequel",
        "entry": {
          "uid": "ani_405",
          "name": "Solo Leveling: ReAwakening",
          "visuals": { "cover": "https://cdn.example.com/movie.jpg" }
        }
      }
    ],
    "similar": [
      {
        "uid": "ani_88",
        "name": "Jujutsu Kaisen",
        "visuals": { "cover": "https://cdn.example.com/jjk.jpg" },
        "score": 8.6,
        "releaseYear": 2020
      }
    ]
  },
  "paging": null,
  "fault": null
}
```

### How Every Content Scenario Maps Cleanly

#### Scenario 1: Movie or Unknown-Type Single Playable Video
`kind` can be `"movie"` or `null`. Because `directTarget` is populated and `groups` is empty, the UI renders a primary **Play** button automatically.
```json
{
  "ok": true,
  "payload": {
    "uid": "ent_9042",
    "name": "Dune: Part Two",
    "kind": null,
    "visuals": { "cover": "https://cdn.example.com/dune2.jpg" },
    "directTarget": {
      "targetId": "tgt_dune2",
      "carry": { "movieToken": "xyz789" },
      "net": { "headers": { "Referer": "https://source.example.com/dune2" } }
    },
    "groups": []
  },
  "paging": null,
  "fault": null
}
```

#### Scenario 2: Download-Only Archive Page (No Streaming Possible)
Set `availability: "download_only"`. The primary CTA automatically changes from **Play** to **Download**, opening the file picker sheet directly.
```json
{
  "ok": true,
  "payload": {
    "uid": "arc_550",
    "name": "Oppenheimer (4K IMAX Remux)",
    "availability": "download_only",
    "visuals": { "cover": "https://cdn.example.com/opp.jpg" },
    "directTarget": {
      "targetId": "tgt_opp_dl",
      "carry": { "postId": "550" }
    }
  },
  "paging": null,
  "fault": null
}
```

#### Scenario 3: Live TV / Sports Broadcast
```json
{
  "ok": true,
  "payload": {
    "uid": "live_19",
    "name": "Star Sports 1 HD",
    "kind": "live",
    "visuals": { "banner": "https://cdn.example.com/ss1.jpg" },
    "directTarget": { "targetId": "tgt_live_19" },
    "liveSchedule": {
      "currentProgram": "IND vs AUS — Day 3",
      "startsAtIso": "2026-11-20T09:00:00Z",
      "endsAtIso": "2026-11-20T16:30:00Z",
      "nextProgram": "Post-Match Show"
    }
  },
  "paging": null,
  "fault": null
}
```

#### Scenario 4: Minimal Scraper (No Type, No Synopsis, No Episode Thumbnails)
```json
{
  "ok": true,
  "payload": {
    "uid": "ser_12",
    "name": "Dark",
    "groups": [
      {
        "groupId": "g1",
        "index": 1,
        "units": [
          { "unitId": "u1", "index": 1 },
          { "unitId": "u2", "index": 2 },
          { "unitId": "u3", "index": 3 }
        ]
      }
    ]
  },
  "paging": null,
  "fault": null
}
```

---

## 7. Operation 4 (Optional): Deferred Unit Loader (`fetchUnits`)

Invoked only when a group sets `"deferredUnits": true` (ideal for 1000+ episode anime or sites that load seasons via separate AJAX calls).

```json
{
  "ok": true,
  "payload": {
    "groupId": "grp_s2",
    "units": [
      {
        "unitId": "u_404_2_1",
        "index": 1,
        "name": "You Aren't E-Rank, Are You?",
        "visuals": { "thumb": "https://cdn.example.com/s2e1.jpg" },
        "runtimeMin": 24,
        "carry": { "epSlug": "solo-leveling-s2-1" }
      }
    ]
  },
  "paging": { "current": 1, "hasMore": false, "token": null },
  "fault": null
}
```

---

## 8. Operation 5: Media Resolution (`resolveMedia`)

Called with `targetId` (or `unitId`), `carry`, and `net`. Returns a **Media Bundle** built for MX Player / VLC-level playback and full download management.

### Rich Response Example (All Capabilities)
```json
{
  "ok": true,
  "payload": {
    "sources": [
      {
        "sourceId": "src_primary_hls",
        "hostName": "AlphaCDN",
        "displayLabel": "AlphaCDN • 1080p HEVC • Multi-Audio",
        "resolutionState": "ready",
        "uri": "https://cdn1.example.com/hls/master.m3u8",
        "container": "hls",
        "qualityTag": "Auto",
        "video": {
          "height": 1080,
          "codec": "hevc",
          "hdr": "hdr10",
          "fps": 24,
          "bitrateKbps": 4600
        },
        "audioTag": "Multi",
        "variant": "sub",
        "priority": 100,
        "canDirectSave": true,
        "net": {
          "headers": {
            "Referer": "https://player.example.com/",
            "Origin": "https://player.example.com"
          },
          "cookieScope": "cdn1.example.com",
          "attachCookies": true,
          "lockUserAgent": true,
          "expiresAtSec": 1795185600
        },
        "sidecarAudio": [],
        "captions": [
          {
            "uri": "https://cdn1.example.com/subs/en.ass",
            "langCode": "en",
            "label": "English (Styled ASS)",
            "syntax": "ass",
            "defaultTrack": true,
            "forced": false,
            "net": null
          }
        ],
        "encryption": null,
        "decoderHint": "auto"
      },
      {
        "sourceId": "src_split_4k",
        "hostName": "DirectStream",
        "displayLabel": "Direct 4K (Split Video + Dual Audio)",
        "resolutionState": "ready",
        "uri": "https://cdn2.example.com/video_2160p.mp4",
        "container": "mp4",
        "qualityTag": "4K",
        "video": { "height": 2160, "codec": "av1", "hdr": "sdr", "fps": 24 },
        "priority": 80,
        "net": null,
        "sidecarAudio": [
          {
            "uri": "https://cdn2.example.com/audio_en.m4a",
            "langCode": "en",
            "label": "English 5.1",
            "codec": "aac",
            "defaultTrack": true,
            "net": null
          },
          {
            "uri": "https://cdn2.example.com/audio_hi.m4a",
            "langCode": "hi",
            "label": "Hindi Stereo",
            "codec": "aac",
            "defaultTrack": false,
            "net": null
          }
        ],
        "captions": [],
        "encryption": null,
        "decoderHint": "hw"
      },
      {
        "sourceId": "src_lazy_mirror",
        "hostName": "BackupHost (Click to Load)",
        "displayLabel": "BackupHost • 1080p",
        "resolutionState": "deferred",
        "uri": null,
        "resolverCarry": {
          "embedUrl": "https://embed.backup.example.com/e/99182"
        },
        "priority": 50
      },
      {
        "sourceId": "src_drm_dash",
        "hostName": "Official DASH",
        "displayLabel": "DASH Widevine 1080p",
        "resolutionState": "ready",
        "uri": "https://cdn3.example.com/manifest.mpd",
        "container": "dash",
        "qualityTag": "1080p",
        "priority": 40,
        "encryption": {
          "scheme": "widevine",
          "licenseUri": "https://lic.example.com/widevine",
          "licenseHeaders": { "X-Session": "abc999" },
          "clearKeys": null
        }
      }
    ],
    "acquisitions": [
      {
        "acqId": "acq_mkv_1080",
        "hostName": "PixelDrive",
        "displayLabel": "1080p x265 10-bit Dual Audio (1.45 GB)",
        "fileName": "Solo.Leveling.S01E01.1080p.mkv",
        "uri": "https://pixeldrive.example.com/api/dl/xyz",
        "delivery": "managed_http",
        "qualityTag": "1080p",
        "format": "mkv",
        "sizeBytes": 1556925644,
        "isBatchPack": false,
        "net": {
          "headers": { "Referer": "https://source.example.com/" },
          "attachCookies": true
        }
      },
      {
        "acqId": "acq_filehost_4k",
        "hostName": "MegaMirror",
        "displayLabel": "4K Remux (Opens Verification Page)",
        "uri": "https://filehost.example.com/wait/abc123",
        "delivery": "browser_handoff",
        "qualityTag": "4K",
        "format": "mkv",
        "sizeBytes": 11811160064,
        "isBatchPack": false,
        "net": null
      }
    ],
    "sharedCaptions": [
      {
        "uri": "https://subs.example.com/hi.vtt",
        "langCode": "hi",
        "label": "Hindi",
        "syntax": "vtt",
        "defaultTrack": false,
        "forced": false,
        "net": null
      }
    ],
    "timeline": {
      "markers": [
        { "kind": "recap", "startMs": 0, "endMs": 42000 },
        { "kind": "opening", "startMs": 85000, "endMs": 175000 },
        { "kind": "ending", "startMs": 1310000, "endMs": 1400000 }
      ],
      "chapters": [
        { "label": "Prologue", "startMs": 0 },
        { "label": "Double Dungeon", "startMs": 175000 }
      ],
      "storyboard": {
        "vttUri": "https://cdn1.example.com/sprites/thumbs.vtt",
        "net": null
      }
    },
    "playbackHints": {
      "isLive": false,
      "dvrWindowSec": null,
      "resumeOffsetMs": null
    }
  },
  "paging": null,
  "fault": null
}
```

### Minimal Valid Response (Single Stream Link)
```json
{
  "ok": true,
  "payload": {
    "sources": [
      {
        "sourceId": "default",
        "hostName": "Main",
        "uri": "https://cdn.example.com/video.m3u8"
      }
    ]
  },
  "paging": null,
  "fault": null
}
```

### Minimal Valid Response (Download-Only Provider)
```json
{
  "ok": true,
  "payload": {
    "sources": [],
    "acquisitions": [
      {
        "acqId": "dl_1",
        "hostName": "Direct Mirror",
        "displayLabel": "720p MP4 (620 MB)",
        "uri": "https://files.example.com/movie_720p.mp4",
        "delivery": "managed_http"
      }
    ]
  },
  "paging": null,
  "fault": null
}
```

### Key Media Bundle Field Reference
* **`container`:** `"hls"`, `"dash"`, `"mp4"`, `"mkv"`, `"webm"`, `"rtmp"`, `"rtsp"`, `"ts"`, `"webview_embed"`, or `"auto"` (default: sniffs from MIME/headers).
* **`resolutionState`:**
  * `"ready"` (default): `uri` is immediately playable.
  * `"deferred"`: Avoids scraping 5–10 slow embed hosts upfront. When the user selects this server (or when a higher-priority source fails), the app calls `resolveDeferredSource(sourceId, resolverCarry)` and gets back a single `"ready"` `StreamSource`.
* **`delivery` (for `acquisitions`):**
  * `"managed_http"`: Downloaded natively by the app's background multi-threaded downloader with pause/resume, custom `net.headers`, and Cloudflare cookies.
  * `"browser_handoff"`: Opened in an in-app WebView or system browser (for hosts with countdown timers, captchas, or JS-gated blobs).
  * `"magnet"`: Hands off or queues a torrent magnet URI.
* **`sidecarAudio`:** Merged directly into the playback pipeline (`MergingMediaSource` in Media3, or `--audio-file` in `libmpv` / custom FFmpeg demuxer) so the user can switch audio tracks seamlessly inside the player.
* **`decoderHint`:** `"auto"`, `"hw"` (MediaCodec hardware), or `"sw"` (FFmpeg software fallback for 10-bit Hi10P / exotic MKV profiles).

---

## 9. Operation 6 (Optional): Deferred Source Resolver (`resolveDeferredSource`)

Only implemented when `features.deferredSources` is `true` and `resolveMedia` returns sources with `"resolutionState": "deferred"`.

```json
{
  "ok": true,
  "payload": {
    "source": {
      "sourceId": "src_lazy_mirror",
      "hostName": "BackupHost",
      "resolutionState": "ready",
      "uri": "https://edge9.backup.example.com/stream.m3u8",
      "container": "hls",
      "net": {
        "headers": { "Referer": "https://embed.backup.example.com/" }
      },
      "captions": []
    }
  },
  "paging": null,
  "fault": null
}
```

---

## 10. Adaptive UI Degradation Rules

The Kotlin UI layer guarantees zero broken cards, zero `"N/A"` strings, and zero empty gaps regardless of how little data a connector returns.

| Condition / Missing Data | Deterministic UI Behavior |
| :--- | :--- |
| `spotlight` is empty on Feed | Omit Hero slider; render first shelf directly with clean top inset |
| `visuals.cover` is `null` | Render a subtle tinted typographic card displaying `name` and optional `badges` |
| `visuals.banner` is `null` on Profile | Stretch `visuals.cover` behind a Gaussian blur + bottom dark scrim gradient |
| `visuals.wordmark` is `null` | Display styled bold typography for `name` |
| `kind` is `null` | Omit content-type pills; infer Profile layout purely from `directTarget`, `groups`, and `availability` |
| `facts` fields partially or fully `null` | Join only non-null facts with `•` separators; collapse the entire row if all are `null` |
| `genres`, `credits`, `relations`, `similar` empty | Completely omit those sections—never render empty-state text |
| Single group (`groups.size == 1`) | Hide group/season selector dropdown and expose units immediately |
| Units lack `visuals.thumb` AND `synopsis` | Switch automatically from **Detailed Unit Rows** to a **Compact Number Grid** (`[ 1 ] [ 2 ] [ 3 ]`) |
| Unit `name` is `null` | Format automatically as `"Episode {index}"` |
| `sources` non-empty, `acquisitions` empty | Launch player directly (offer download only if active source has `canDirectSave: true`) |
| `sources` empty, `acquisitions` non-empty | Skip player; open **Download Manager Sheet** immediately without error |
| Both `sources` and `acquisitions` empty | Trigger `NOTHING_RESOLVABLE` state with one-tap connector switcher |
| Single `"ready"` source, zero acquisitions | Start playback immediately without showing a mirror selector |

---

## 11. Shared Session Vault (Cloudflare & Per-Item Header Architecture)

To make per-request headers and Cloudflare challenges rock-solid across the entire Android app, all five subsystems must read from a single Kotlin **Session Vault**:

```text
                    ┌───────────────────────────────────┐
                    │       Kotlin Session Vault        │
                    │  • Scoped CookieJar (by domain)   │
                    │  • Locked User-Agent per domain   │
                    │  • Encrypted Connector Key-Value  │
                    └─────────────────┬─────────────────┘
                                      │
      ┌───────────────┬───────────────┼───────────────┬───────────────┐
      ▼               ▼               ▼               ▼               ▼
  QuickJS HTTP   Headless/UI      Coil Image     Native Video     Download
   (OkHttp3)       WebView          Loader     (FFmpeg/Media3)    Manager
```

### Header Merge Precedence (Lowest → Highest)
1. App global defaults (fallback `User-Agent`, `Accept-Encoding`).
2. `connector.json` → `defaultNet.headers`.
3. Vault locked `User-Agent` (overrides #1 and #2 when `lockUserAgent: true` after a challenge solve).
4. Per-item / Per-source / Per-request `net.headers` (always wins for `Referer`, `Origin`, `Authorization`, and custom tokens).

---

## 12. JavaScript Runtime & Native Bridge (`globalThis.Bridge`)

Each connector is a standalone ES2020 module executed inside an isolated **QuickJS** context.

### Exported Connector Functions
```javascript
// Mandatory
export async function fetchProfile(uid, carry, net) {}
export async function resolveMedia(targetId, carry, net) {}

// Optional (declared in connector.json -> features)
export async function fetchFeed(page, token) {}
export async function queryCatalog(request) {}
export async function fetchUnits(groupId, page, token, carry) {}
export async function resolveDeferredSource(sourceId, resolverCarry) {}
```

### Native Bridge Injected by Kotlin (`globalThis.Bridge`)
| Method | Native Implementation | Purpose |
| :--- | :--- | :--- |
| `Bridge.http.send(req)` | OkHttp3 + Session Vault | Arbitrary HTTP GET/POST/HEAD with per-call headers, body, timeout, redirect control, returning `{ status, finalUrl, headers, bodyText }` |
| `Bridge.dom.query(html, css)` | Jsoup (Native JVM) | Fast CSS selector extraction without shipping heavy JS DOM parsers |
| `Bridge.webview.sniff(opts)` | Hidden Android WebView | Executes heavy JS pages, solves background scripts, and intercepts matching media requests (`.m3u8`, `.mpd`, `.mp4`, API XHRs) along with their exact request headers |
| `Bridge.crypto.decrypt(opts)` | Android JCA (`Cipher`) | Native AES-CBC/GCM/CTR, HMAC, SHA-256, MD5, Base64, and Hex helpers |
| `Bridge.vault.get(key)` / `set(key, val)` | EncryptedSharedPreferences | Persistent per-connector storage (tokens, cached endpoints, user config values) |
| `Bridge.log(level, msg)` | Logcat + In-App Console | Real-time script debugging inside the app |

---

## 13. Kotlin Serialization Defensiveness

Configure `kotlinx.serialization` so third-party or rapidly edited JS connectors can never crash the native client:

```kotlin
val connectorJson = Json {
    ignoreUnknownKeys = true   // Ignores future or vendor-specific keys
    coerceInputValues = true   // Replaces unexpected nulls with Kotlin default values
    isLenient = true           // Tolerates minor non-strict JSON formatting
    explicitNulls = false      // Keeps outbound JS payloads clean
}
```

### Mandatory Kotlin Model Rules
* Every optional property in every `@Serializable` data class must define a default (`= null`, `= false`, `= emptyList()`, or `= emptyMap()`).
* Never serialize open-ended string fields like `kind`, `container`, `cardStyle`, or `reason` as strict Kotlin `enum`s without a custom fallback serializer—map unknown values safely to `UNKNOWN` / `AUTO` so future connector versions stay backwards-compatible.