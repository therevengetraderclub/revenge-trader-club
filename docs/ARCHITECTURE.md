# Architecture

Single-file app (`index.html`). Inline CSS + JS. No build step yet.

## Storage

All persistence goes through **one object: `RTCStore`**. Only three raw
`localStorage` calls exist in the codebase, and all three are inside the
localStorage backend adapter.

    RTCStore.get(key)          synchronous — served from an in-memory cache
    RTCStore.set(key, value)   updates cache, persists via the backend
    RTCStore.remove(key)
    RTCStore.keys()
    RTCStore.clearNamespace()  wipes only rtc_* keys
    RTCStore.ready             promise; resolves when hydrated

Reads are synchronous because the app renders synchronously. Writes persist to
whatever backend is attached. That in-memory cache is what allows an async
backend (IndexedDB, Supabase) to sit behind a sync API.

**Only keys prefixed `rtc_` are ever read, written, or deleted.**

### Backends

- `localBackend` — localStorage. ~5MB cap. Fallback.
- `makeIDBBackend()` — IndexedDB. Hundreds of MB. Default when available.

On first load, if IndexedDB is empty and localStorage has `rtc_` keys, they are
copied across. localStorage is **not** cleared — it remains a safety net.

If IndexedDB throws (private browsing, etc.) the store falls back to
localStorage rather than locking the user out.

### Boot order

IndexedDB can resolve *after* `DOMContentLoaded`. Every entry point therefore
uses `rtcOnReady(fn)`, which waits for the DOM **and** the store. Using
`DOMContentLoaded` alone would render an empty dashboard over intact data.

## Backup / restore

- `exportAllData()` — sweeps every `rtc_*` key. Lossless. Future keys included
  automatically.
- `importAllData(file)` — downloads a rollback snapshot first, then replaces
  data. Refuses to write keys outside the `rtc_` namespace. Reads legacy v2.1
  backups.

## Roadmap

1. ~~Remove duplicate DOM ids~~ done
2. ~~Storage guard (quota errors were silent)~~ done
3. ~~Backup + restore~~ done
4. ~~`RTCStore` abstraction~~ done
5. ~~IndexedDB backend~~ done
6. Supabase: schema + row-level security
7. Auth (email/password, confirmation, reset)
8. Screenshots → Supabase Storage (drop base64, ~33% saving)
9. Stripe via serverless functions + webhook
10. Legal: privacy policy, ToS, data export/delete (GDPR/CCPA)
