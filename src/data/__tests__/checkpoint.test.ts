import fs from 'fs';
import path from 'path';
import { applyChangesPage, applyRecords, createEmptyStore } from '../store';
import { buildMonths } from '../aggregate';
import { normalizeTxn } from '../normalize';
import { parseDecimalToMinor } from '../money';
import { Account, Txn } from '../types';

describe('checkpoint', () => {
  const mockDir = process.env.MOCK_DIR
    ? path.resolve(process.env.MOCK_DIR)
    : path.resolve(process.cwd(), '../track-api-mock');
  const fixturesDir = path.join(mockDir, 'fixtures');

  const txnsPath = path.join(fixturesDir, 'transactions.json');
  const changesPath = path.join(fixturesDir, 'changes.json');
  const accountsPath = path.join(fixturesDir, 'accounts.json');
  const checkpointPath = path.join(fixturesDir, 'checkpoint.json');

  const fixturesExist =
    fs.existsSync(txnsPath) &&
    fs.existsSync(changesPath) &&
    fs.existsSync(accountsPath) &&
    fs.existsSync(checkpointPath);

  const testFn = fixturesExist ? it : it.skip;

  testFn('matches checkpoint.json after paginated list sync and changes feed', () => {
    if (!fixturesExist) {
      return;
    }

    const accounts: Account[] = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
    const transactions: unknown[] = JSON.parse(fs.readFileSync(txnsPath, 'utf8'));
    const changes: unknown[] = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

    let store = createEmptyStore();

    // 1. Simulate pagination with page size 100 and boundary record re-send
    const limit = 100;
    let offset = 0;

    while (offset < transactions.length) {
      const pageItems = transactions.slice(offset, offset + limit);
      const normalized: Txn[] = [];
      for (const raw of pageItems) {
        const norm = normalizeTxn(raw, accounts);
        if (norm) {
          normalized.push(norm);
        }
      }
      store = applyRecords(store, normalized);

      if (offset + limit >= transactions.length) {
        break;
      }
      // Position-based cursor where server re-sends boundary record (last item of page N is first of page N+1)
      offset = offset + limit - 1;
    }

    // 2. Apply changes feed in order through store functions
    const changeResult = applyChangesPage(store, changes, accounts);
    store = changeResult.store;

    // 3. Verify transaction count
    expect(Object.keys(store.byId).length).toBe(checkpoint.transaction_count);

    // 4. Verify per-calendar-month totals in Asia/Kolkata
    const months = buildMonths(store);
    const monthsMap = new Map(months.map((m) => [m.key, m]));

    for (const [key, exp] of Object.entries<{ spend: string; income: string }>(checkpoint.months)) {
      const expSpend = parseDecimalToMinor(exp.spend);
      const expIncome = parseDecimalToMinor(exp.income);

      const got = monthsMap.get(key);
      expect(got).toBeDefined();
      expect(got?.spendMinor).toBe(expSpend);
      expect(got?.incomeMinor).toBe(expIncome);
    }
  });
});
