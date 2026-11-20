# AniDap Connector (MMCP v1.0)

Anime streaming connector for [anidap.lol](https://anidap.lol/home).

## How it works

| Layer | Source |
|---|---|
| Metadata (feed / search / profile) | AniList GraphQL `https://graphql.anilist.co` (public, no key) — same data AniDap displays |
| Episode list | `GET chad.anidap.lol/rest/api/episodes?id={slug}` |
| Server list | `GET chad.anidap.lol/rest/api/servers?id={slug}&epNum={n}` → `subProviders` / `dubProviders` / `hSubProviders` |
| Streams | `GET chad.anidap.lol/rest/api/sources?id={slug}&epNum={n}&type={sub\|dub\|hsub}&providerId={id}` → `sources[0].url` (HLS), `tracks` (subtitles), `chapters` (intro/outro), `headers.Referer` |
| Slug lookup | `GET anidap.lol/api/anime/{anilistId}` → `{ success, data: { id: slug } }`, cached in `Bridge.vault`; fallback: `graphql.anidap.lol` `catalogAnime` pagination |

All chad calls send `Origin: https://anidap.lol` + `Referer: https://anidap.lol/`.

## Design choices

- **Deferred sources:** `resolveMedia` only calls `/servers` and returns `resolutionState: "deferred"` sources; `resolveDeferredSource` fetches the actual m3u8 on tap. Pages stay instant even with 6+ servers.
- **Deferred units:** series with >100 episodes (e.g. One Piece) set `deferredUnits: true`; `fetchUnits` pages 100 at a time.
- **Raw stream URLs:** the web frontend XOR/base64-transforms some provider URLs for browser playback; raw `sources[].url` + `Referer` header works natively in ExoPlayer/Media3, so no transform is applied.
- **Graceful degradation:** if slug/episode resolution fails, `fetchProfile` still returns full AniList metadata with an episode-count group.

## Settings

- `mirror_domain` (optional): custom AniDap mirror base URL, default `https://anidap.lol`.

## Test

```bash
node providers/anidap/test.mjs
```

Offline harness with a mocked `Bridge` (canned AniList + chad responses) validating the MMCP envelope for all 6 operations.
