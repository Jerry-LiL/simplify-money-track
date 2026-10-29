# Track — Simplify Money FE assignment

React Native (Expo, TypeScript) version of the Track screen: a year of
transactions month by month, what was spent and earned each month, search by
merchant, a detail screen, and an offline copy that survives restarts.

Built against [`simplify-money/track-api-mock`](https://github.com/simplify-money/track-api-mock).

- Android build: [app-release.apk on the v1.0 release](https://github.com/Jerry-LiL/simplify-money-track/releases/tag/v1.0) (debug-signed; see "Using the APK" below)
- Walkthrough video: _Vineet to add link_
- PR #412 review: [REVIEW.md](REVIEW.md)
- Design notes for talking through it: [NOTES.md](NOTES.md)

## Run it (under 5 minutes)

Needs Node 18+ and git. On the phone, either the Expo Go app (SDK 58) or the APK above.

```bash
git clone https://github.com/Jerry-LiL/simplify-money-track.git
cd simplify-money-track
npm install
npm run dev
```

`npm run dev` clones the mock next to this repo (`../track-api-mock`) if it
isn't there, starts `node server.js` on port 4010, and starts Expo with
`EXPO_PUBLIC_API_URL` set to your machine's LAN IP. Scan the QR code with Expo
Go, or press `a` for an Android emulator.

Already have the mock somewhere else: `MOCK_DIR=/path/to/track-api-mock npm run dev`.
Want a different server (e.g. your own fixtures via `FIXTURES=`): start it
yourself and set `API_URL=http://<ip>:4010 npm run dev`.

**Using the APK:** start the mock (`node server.js`), open the app, tap
**Settings**, enter `http://<your computer's LAN IP>:4010` and save. The APK
defaults to `http://10.0.2.2:4010`, which is the host machine from an Android
emulator. Release builds allow plain HTTP on purpose so they can reach the mock.

### Tests

```bash
npm test            # unit tests for the data layer (+ checkpoint test if ../track-api-mock exists)
npm run test:live   # starts the real mock server, with its injected 500/429/503 and slow pages,
                    # syncs against it and checks every month against checkpoint.json
npm run typecheck
```

Last run: `npm test` 89 passed across 11 suites (the live suite is skipped unless `LIVE=1`); `npm run test:live` 1 passed in ~82 s against the non-calm server; `tsc --noEmit` clean.

### Building the APK yourself

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk (debug-signed)
```

Needs a JDK 17+ and the Android SDK (`ANDROID_HOME`). No Expo account or EAS needed.

## How it's put together

```
src/data/        no React in here, all of it unit tested
  normalize.ts   two record shapes -> one Txn
  money.ts       integer paise, ₹ with lakh/crore grouping
  dates.ts       IST month keys and labels, by hand (no Intl timezone)
  store.ts       byId + tombstones, newest updated_at wins
  aggregate.ts   months, totals, list rows, search
  api.ts         fetch with timeout, retries, Retry-After
  sync.ts        full + incremental sync into a staging copy
  persist.ts     chunked snapshot in AsyncStorage, manifest written last
src/state/       TrackProvider: cache first, then sync; NetInfo + AppState triggers
src/screens/     Track (list + search), Detail, Settings
```

Flow on launch: read the snapshot from disk and render it → sync in the
background → if every page succeeds, swap the new store in and write it to
disk. If anything fails, the old data stays on screen with a line saying why.

## Decision log

1. **Expo, not bare.** I didn't need any native code of my own, and Expo got me
   a phone running the app in minutes. I was worried Expo would force an EAS
   account for the APK. It doesn't: `expo prebuild` + `./gradlew assembleRelease`
   builds it locally, so I kept Expo.

2. **Normalise at the edge, keep the raw record.** About half of
   `/v1/transactions` (2,281 of 4,675 rows, everything before April 2026) comes
   back in an older shape: `txn_time` in unix seconds, `amount` as a rupee
   string like `"516.49"`, `type: DR/CR`, `account: "4821"`. I convert both
   shapes into one `Txn` in `normalize.ts` and nowhere else. The original JSON
   is kept on the row so the detail screen can show "everything we know"
   without me guessing which fields matter. Rows I can't parse are skipped and
   counted, and the count is shown in Settings instead of being hidden.

3. **Paise as integers, rupee strings parsed by hand.** `"516.49"` is split on
   the dot and turned into `51649` without ever going through a float. Totals
   are sums of integers. I format with lakh/crore grouping myself instead of
   `toLocaleString('en-IN')`, because I didn't want the numbers to depend on which Intl data the
   phone's JS engine happens to have.

4. **Months are IST months.** I first grouped by the UTC date and October 2025
   was off. The very first salary (`₹2,42,333`) is at `2025-09-30T19:02Z`, which
   is 1 Oct, 12:32 am in India. Grouping on IST puts it in October, and that's
   also where `checkpoint.json` expects it. The backend's own
   `/v1/summary/months` buckets in UTC (it has a September 2025 with 2
   transactions), so I don't use that endpoint at all.

5. **Self transfers are found by the link, not the category.** Own-account
   moves have `counterparty.type: OWN_ACCOUNT` (new shape) or
   `linked_account` (old shape). There is also a `TRANSFERS_OUT` category, 44
   rows of `UPI/RAHUL SHARMA` and similar, which looks like the same thing by
   name but is money going to someone else. That's spending. Using the link
   instead of the category string keeps both right, and it doesn't depend on
   category names the other dataset might spell differently.

6. **Refunds count as income. I'd have done it the other way.** My instinct was
   to net `AMAZON PAY REFUND` against spend, since a refund isn't really
   earning. I tried it and 9 of 13 months stopped matching the checkpoint. The
   backend's definition is credits = income, so I followed it, and the row is
   labelled so the user can see what it is. I'd raise this with product rather
   than quietly disagree with the server.

7. **Newest `updated_at` wins, including over the change feed itself.** The
   change feed re-sends `txn_DAFC2853…` (a chai payment) with an older
   `updated_at` after the newer posted version has already come through. Applying
   changes in order puts back the pending ₹39 instead of the posted ₹89, and
   October is ₹50 off the checkpoint. So every write compares `updated_at`.
   Deletions leave a tombstone with their timestamp so a late re-send can't bring
   a deleted row back. Old-shape rows have no `updated_at`, so they count as
   oldest and any new-shape version replaces them (the feed does this for 3 rows
   that move from `FOOD` to `DINING_OUT`).

8. **Dedupe by id, not by "looks the same".** The list cursor is
   position-based and the server re-sends the last row of a page as the first
   row of the next one. Keying the store by `id` makes that a non-event. I
   thought about also merging rows that look identical (same merchant, amount,
   minute) but the data has real repeats like several `UPI/CHAI POINT` on the
   same day, so I didn't.

9. **Sync into a copy, commit at the end.** The list endpoint fails once with a
   500, once with a 429 (`Retry-After: 3`), and has a 4 second page; the change
   feed fails first time with a 503 and answers an unknown token with a 410. The
   API layer retries with backoff and honours `Retry-After`. The sync builds a
   new store on the side and only swaps it in when the last page is done, so a
   failure halfway never removes anything from the screen. A 410 falls back to
   a full sync, same rules. I rejected showing pages as they arrive on the first
   launch: a half-loaded month would show a wrong total, so the first launch
   shows progress instead of numbers.

10. **AsyncStorage in chunks, manifest last.** One JSON blob of the whole store
    is about 2.4 MB, and Android's AsyncStorage (SQLite underneath) can fail to
    read back a single value that big. I split the transactions into chunks of
    400 and write a small manifest last; if the app is killed mid-write, the old
    manifest still points to a complete old snapshot. SQLite would be cleaner,
    but this was the smaller change for the time I had.

## What the data made me decide

| What I saw | What I did | With more time |
|---|---|---|
| Two record shapes in one list | One normaliser, raw record kept for the detail screen | Ask the backend whether the old shape will ever come back from `/changes` too (it can, the code handles it) |
| Boundary row repeated on every page | Store keyed by id | — |
| 25 `PENDING` rows; 20 later post with a different amount, 5 just disappear | Pending is included in totals and tagged; posted version replaces it by id; deletions remove it | Show "pending" totals separately |
| 15 USD charges with `fx.inr_minor` | Totals use the INR value; the row shows both | If `fx` is missing, the row is shown but left out of the total with a note, rather than counted at a made-up rate |
| `category: null` on 3 rows, `DINING_OUT` only appears in the change feed | Shown as "Uncategorised"; categories are display-only, nothing depends on the list of names | — |
| Merchants like `☕ Third Wave Coffee` and `राम किराना स्टोर` | Search normalises Unicode (NFKD) and lowercases, no ASCII-only regexes | Transliteration so "ram kirana" finds the Hindi name |
| 3 `MAKEMYTRIP` rows arrive in the change feed dated 30–31 Aug | Months are recomputed from the store after every sync, not patched | Highlight months whose totals changed since last view |
| A stale change re-sent after a newer one | `updated_at` comparison on every write | — |
| `/v1/summary/months` disagrees with the checkpoint (UTC months, transfers counted) | Not used; totals computed on device from the synced rows | Ask the backend team, because other screens might be using it |
| 410 for an unknown sync token, 503/500/429 with `Retry-After` | Full-sync fallback, retries with backoff | Background fetch so the first open of the day is already fresh |

## PR #412 review

See [REVIEW.md](REVIEW.md). 10 comments, 9 of them blocking. Short version:
it wipes the list on any error, doesn't check `res.ok`, double-counts the
boundary rows, crashes on the older record shape, counts self transfers and
USD-as-rupees in the total, cuts months in UTC, never reads the change feed,
and formats rupees the US way.

## AI disclosure

- **Google Antigravity CLI (Gemini 3.8 Flash)** wrote most of the code in
  `src/`, from long prompts that spelled out the data rules (two shapes,
  boundary duplicates, IST months, `updated_at` ordering, etc.).
- **An AI assistant (Grok Bot)** explored the fixtures with small Python
  scripts to work out those rules against `checkpoint.json`, ran the
  Antigravity sessions, reviewed the output, and drafted this README,
  REVIEW.md and NOTES.md.
- Every rule in the decision log was checked against the fixtures: the
  checkpoint test and the live test both have to match all 13 months.

**One case where the AI's output was wrong:**

> _VINEET: replace this block with one case in your own words._
>
> A real candidate from this build, the first version of `searchTxns`
> (commit "Month grouping and totals, skip own-account transfers"):
>
> ```ts
> const inrFormatted = normalizeSearchText(formatINR(txn.amountMinor));
> const foreignFormatted = normalizeSearchText(formatForeign(txn.amountMinor, txn.currency));
> if (decimalStr.includes(q) || wholeStr.includes(q) || minorStr.includes(q) ||
>     inrFormatted.includes(q) || foreignFormatted.includes(q)) {
>   matched.push(txn);
> }
> ```
>
> It formatted every amount as rupees, so the US$10.00 Notion charge showed
> up for "₹10", and it matched any substring of the amount, so typing "4"
> while looking for a merchant matched most of the year. The fixed version
> (commit "Tighten search: merchant first, amounts only for numeric
> queries") only compares amounts when the query has at least two digits,
> compares against the INR value (`inrMinor`), and needs the whole rupee
> part to match:
>
> ```ts
> if (looksNumeric && txn.inrMinor !== null) {
>   ...
>   if (rupeeStr === queryNumberClean) matched.push(txn);
> }
> ```

## What's unfinished

Being straight about what I didn't get to:

- **Not tried on a physical phone yet.** What's verified: unit tests, the live
  sync test against the real flaky server, a type check, an Android JS bundle
  export, and a release APK that builds. Scrolling smoothness with ~4.7k rows is
  designed for (FlashList, item types, memoised rows, precomputed month rows) but
  I haven't measured frame times on a device.
- **No TalkBack / VoiceOver pass.** Rows and headers have accessibility labels
  (amounts read as "rupees" rather than "₹"), but I haven't listened to it.
- **Offline copy is AsyncStorage, chunked.** Fine for a year of data; for more,
  I'd move to SQLite and stop writing the whole snapshot on every sync.
- **No background refresh.** It syncs on launch, on reconnect, on returning to
  the foreground after a minute, and on pull-to-refresh.
- **Refunds count as income.** That's what checkpoint.json implies. If product
  wants refunds netted against spend instead, it's a one-line change in
  `aggregate.ts`, but the checkpoint test would need new expected numbers.
- **The APK is debug-signed** and defaults to `http://10.0.2.2:4010`, so on a
  real phone you set the server in Settings.
- **iOS not built or tested.**
- Walkthrough video: to be recorded.
