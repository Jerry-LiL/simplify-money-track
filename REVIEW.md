# Review of PR #412 — "Track: load transactions from the new API"

Files: `review/useTransactions.ts`, `review/TrackScreen.tsx` in the mock repo.
Already has one approval. I would not merge it yet. Most important first.

**1. A failed page wipes the screen — block.**
`useTransactions.ts:34-36` sets `transactions` to `[]` in the catch, and
`TrackScreen.tsx:98` replaces the whole list with "Something went wrong".
The mock returns a 500 on the 6th list request and a 429 on the 11th, so
scrolling back a few months is enough to empty a screen the user was just
reading. Keep what we have, show the error next to it, retry.

**2. `res.ok` is never checked — block.**
Line 30-31 parses whatever comes back. A 500/429 body is `{ error: ... }`,
so `body.items` is undefined and `[...transactions, ...body.items]` throws,
which lands in the catch from comment 1. The 429 also sends `Retry-After: 3`
that nobody reads. Check the status, back off, honour `Retry-After`.

**3. Duplicates at every page boundary — block.**
The cursor is position-based and the server re-sends the last record of the
previous page as the first record of the next one. Line 32 appends pages
blindly, so with the default page size of 50 roughly one row in fifty is
shown twice, and counted twice in the month total. Dedupe by `id`.
`keyExtractor={(_, index) => String(index)}` hides this from React instead of
surfacing a duplicate-key warning.

**4. Half the history isn't in the shape the `Txn` type says — block.**
Everything before April 2026 comes back as `{ txn_time, amount: "516.49",
type: "DR", merchant_name, account: "4821" }`. For those rows
`t.occurred_at.slice(0, 7)` (line 57) throws, `amount_minor` is undefined and
`merchant` is blank. The type gives a false sense of safety here. Normalise
both shapes at the edge, and skip-and-count anything we can't read.

**5. The month total isn't "what I spent" — block.**
`monthTotal` (line 63-67):
- divides every amount by 100 and sums floats, so totals drift by paise;
- counts every debit, including moving money between your own accounts. A
  self transfer from HDFC to ICICI or paying the HDFC card bill from ICICI
  shows up as spending, and the card purchases it pays for were already
  counted. These rows are marked (`counterparty.type: OWN_ACCOUNT`, or
  `linked_account` on old rows);
- adds USD rows as if they were rupees (`amount_minor: 1000, currency: USD`
  becomes ₹10 instead of the ₹866.61 in `fx.inr_minor`);
- never shows income, which the screen is supposed to show.
Sum integer paise, skip own-account transfers, use the INR value.

**6. Months are cut in UTC — block.**
`occurred_at.slice(0, 7)` buckets by the UTC date. Anything between 00:00
and 05:29 IST on the 1st lands in the previous month. The first row of the
whole dataset (`2025-09-30T19:02Z`) is 1 Oct 00:32 IST. Group by the IST date.

**7. No change feed, so the data is never current — block.**
The PR only reads `/v1/transactions`. Pending card transactions that later
post with a different amount, deletions, and late transactions dated back in
August only come through `/v1/transactions/changes`. Refresh refetches page 1
and throws the rest away. There is also nothing cached, so with no network
the screen is empty. Needs the sync token, the change feed (with a
"newest `updated_at` wins" rule, the feed re-sends an older version of at
least one record), and a local copy.

**8. Stale closure in `load` — block (small fix).**
`load` reads `transactions` and `cursor` from the render it was created in.
`onEndReached` can fire twice before the first page resolves, so the same
cursor is fetched twice, and a refresh racing a loadMore can append an old
page to new data. Guard with an in-flight ref and use functional `setState`.

**9. Amounts read like US numbers — block, it's a one-liner.**
`toLocaleString('en-US')` prints ₹1,479,390.89; our users read ₹14,79,390.89.
The header uses `toFixed(2)` with no grouping at all. Also
`new Date('2026-10')` is parsed as UTC midnight, so on a device set to a
negative-offset timezone the header says September.

**10. Hard-coded `10.0.2.2` and FlatList setup — let through, follow up.**
`API` only works on the Android emulator; it should come from config so a
real phone can reach the dev machine. The list rebuilds `data` on every
render, uses index keys and mixes headers and rows without telling the list
about item types. Fine for a first cut, but with ~4,700 rows it will stutter;
memoise the rows and move to FlashList with `getItemType`.

## How the app in this repo handles each one

| # | Where |
|---|---|
| 1 | `src/data/sync.ts` builds into a staging copy and only commits when every page succeeded; the UI keeps showing the last good snapshot with a banner |
| 2 | `src/data/api.ts` checks status, retries 5xx/429/network errors with backoff and `Retry-After` |
| 3 | `src/data/store.ts` keys everything by `id` |
| 4 | `src/data/normalize.ts` |
| 5, 6 | `src/data/aggregate.ts`, `src/data/money.ts`, `src/data/dates.ts` |
| 7 | `src/data/sync.ts` + `src/data/persist.ts` |
| 8 | one in-flight sync promise shared by every caller |
| 9 | `formatINR` does lakh/crore grouping by hand; month labels come from the `YYYY-MM` key, not `new Date` |
| 10 | API URL from `EXPO_PUBLIC_API_URL`, editable in the app; FlashList with item types |
