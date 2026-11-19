# Track — Simplify Money FE assignment

The Track screen in React Native (Expo, TypeScript): a year of transactions month by month, spend and income per month, search by merchant, a detail screen, and an offline copy that survives restarts.

Built against [`simplify-money/track-api-mock`](https://github.com/simplify-money/track-api-mock).

- Android build: [app-release.apk on the v1.0 release](https://github.com/Jerry-LiL/simplify-money-track/releases/tag/v1.0) (debug-signed)
- PR #412 review: [REVIEW.md](REVIEW.md)
- Stretch task: **sync that holds up** (app killed mid-sync, expired token, racing syncs). See `src/data/sync.ts` and `src/data/persist.ts`.

## Run it

Needs Node 18+ and git. On the phone, Expo Go (SDK 58) or the APK.

```bash
npm install
npm run dev
```

`npm run dev` clones the mock into `../track-api-mock` if it isn't there, starts it on port 4010, and starts Expo with `EXPO_PUBLIC_API_URL` set to your LAN IP.

- Mock somewhere else: `MOCK_DIR=/path/to/track-api-mock npm run dev`
- Your own server: `API_URL=http://<ip>:4010 npm run dev`

With the APK, open Settings and enter `http://<your LAN IP>:4010`. It defaults to `http://10.0.2.2:4010` (the host machine from an Android emulator).

## Tests

```bash
npm test            # data layer unit tests
npm run test:live   # syncs against the real mock (with its 500/429/503s) and checks every month against checkpoint.json
npm run typecheck
```

Building the APK yourself (JDK 17+ and Android SDK, no EAS needed):

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## Layout

```
src/data/      normalize, money, dates, store, aggregate, api, sync, persist (no React, all unit tested)
src/state/     TrackProvider: cache first, then sync
src/screens/   Track, Detail, Settings
```

On launch it renders the saved snapshot, syncs in the background, and only swaps in the new data once every page has come back. If something fails, the old data stays on screen with a note.

## Decisions

- **Two record shapes.** Everything before April 2026 comes back in an older shape (`txn_time`, rupee strings, `DR/CR`). Both are converted to one `Txn` in `normalize.ts`; the raw record is kept for the detail screen.
- **Money is integer paise.** Rupee strings are parsed without floats, and ₹ is formatted with lakh/crore grouping by hand so it doesn't depend on the phone's Intl data.
- **Months are IST months.** The first salary lands at 30 Sep 19:02 UTC, which is 1 Oct in India, and that's where `checkpoint.json` expects it. `/v1/summary/months` buckets in UTC, so I don't use it.
- **Self transfers are found by the account link**, not the `TRANSFERS_OUT` category, which is actually money sent to other people.
- **Refunds count as income**, because that's what the checkpoint implies. I'd have netted them against spend; worth raising with product.
- **Newest `updated_at` wins** on every write, since the change feed re-sends an older version of a row after the newer one. Deletes leave tombstones.
- **Dedupe by id.** The cursor is position-based and repeats the last row of each page.
- **Sync into a copy.** Retries with backoff and honours `Retry-After`; a 410 falls back to a full sync.
- **AsyncStorage in chunks of 400, manifest written last**, so a kill mid-write leaves the old snapshot intact.

## Not done yet

- Not tried on a physical phone; no TalkBack/VoiceOver pass.
- No background refresh (syncs on launch, reconnect, foreground and pull-to-refresh).
- SQLite would be better than chunked AsyncStorage for more than a year of data.
- iOS not built.
