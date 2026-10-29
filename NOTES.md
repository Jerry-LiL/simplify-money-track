# Notes for walking through the design

Short version I can talk from in an interview. The README has the full
decision log.

## The one-line picture

Server → `api.ts` (retries) → `sync.ts` (builds a new store on the side) →
`store.ts` (by id, newest `updated_at` wins) → `aggregate.ts` (months,
totals, rows) → screens. `persist.ts` saves the store after every good sync,
and the app always starts from that saved copy.

## Walkthrough order

1. **Start at the data, not the UI.** Open `fixtures/transactions.json` and
   show the two shapes side by side (`occurred_at`/`amount_minor` vs
   `txn_time`/`amount: "516.49"`). That's why `normalize.ts` exists.
2. **`store.ts`** is the heart of it. Two maps: `byId` and `tombstones`.
   Every write checks `updated_at`. Explain the `txn_DAFC2853…` case: the
   change feed sends an older version after a newer one, and October is ₹50
   off if you apply blindly.
3. **`aggregate.ts`**: month key is the IST date. Spend = debits, income =
   credits, both skip own-account transfers (found by `counterparty` /
   `linked_account`, not the category name). USD rows use `fx.inr_minor`.
   Refunds are income because that's what the checkpoint says.
4. **`sync.ts`**: full sync pages through `/transactions` (limit 100), then
   immediately reads `/changes` from the list's token. Incremental sync only
   reads `/changes`. 410 → full sync. All of it writes to a copy, and the copy
   only replaces the live store at the very end. One sync at a time; a second
   caller gets the same promise.
5. **`TrackProvider`**: load snapshot → render → sync. Sync again when the
   network comes back or the app comes to the foreground after a minute.
6. **Screens**: one FlashList with two item types (month header, transaction),
   sticky headers. Search swaps in a flat list of matches.

## Questions I expect, and my answers

- **Why not use `/v1/summary/months`?** It buckets by UTC and counts self
  transfers, so it disagrees with the checkpoint. Totals come from the rows
  the user can actually see, so the header always adds up to the list.
- **Why not show pages as they load?** On the first launch a half-loaded
  month would show a wrong total. Once there's a saved copy, the old data
  stays on screen while the sync runs.
- **What if the app is killed during a sync?** Nothing has been committed, so
  the next launch starts from the last saved snapshot and syncs again. Saving
  writes chunks first and the manifest last, so a kill mid-save also leaves the
  previous snapshot readable.
- **What if two syncs start at once?** (pull-to-refresh + reconnect) They
  share one in-flight promise. Changing the server URL waits for the old sync
  and drops its result.
- **Why integer paise?** `0.1 + 0.2` problems, and the legacy amounts are
  strings. Parse the string into paise directly, never via a float.
- **How do you know the numbers are right?** `checkpoint.test.ts` replays
  the fixtures through the real store code and compares every month.
  `npm run test:live` does it against the running server with its errors
  turned on.
- **What would you do next?** SQLite instead of chunked AsyncStorage, a
  background fetch task, measured scroll performance on a low-end phone,
  and a TalkBack pass.

## Things to be honest about

- Most of the code was generated with Antigravity (Gemini) from detailed
  prompts and then reviewed and corrected. Be ready to point at the search
  bug in the AI disclosure and explain the fix.
- Scroll performance hasn't been measured on a real device.
