import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { buildMonths } from '../aggregate';
import { createApi, SyncTokenExpired } from '../api';
import { parseDecimalToMinor } from '../money';
import { createEmptyStore } from '../store';
import { incrementalSync, resetSyncStateForTests, syncAll } from '../sync';

const isLive = process.env.LIVE === '1';
const describeFn = isLive ? describe : describe.skip;

function nodeFetch(input: string | URL, init?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.toString());
    const req = http.request(
      url,
      {
        method: init?.method || 'GET',
        headers: init?.headers,
        signal: init?.signal,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');
          const headerMap = new Map<string, string>();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              headerMap.set(k.toLowerCase(), Array.isArray(v) ? v.join(', ') : v);
            }
          }
          resolve({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            status: res.statusCode || 0,
            headers: {
              get: (k: string) => headerMap.get(k.toLowerCase()) || null,
            },
            json: async () => JSON.parse(bodyText),
            text: async () => bodyText,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// In test environment, replace Expo JSI stub with real HTTP fetch
if (isLive) {
  globalThis.fetch = nodeFetch as any;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(addr.port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string, maxWaitMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${baseUrl}/v1/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server failed to respond to /v1/health within ${maxWaitMs}ms`);
}

describeFn('live integration', () => {
  jest.setTimeout(120_000);

  const mockDir = process.env.MOCK_DIR
    ? path.resolve(process.env.MOCK_DIR)
    : path.resolve(process.cwd(), '../track-api-mock');
  const fixturesDir = path.join(mockDir, 'fixtures');
  const checkpointPath = path.join(fixturesDir, 'checkpoint.json');

  let serverProcess: ChildProcess | null = null;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const serverEnv: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
    delete serverEnv.SM_CALM;

    serverProcess = spawn('node', ['server.js'], {
      cwd: mockDir,
      env: serverEnv,
      stdio: 'pipe',
    });

    await waitForHealth(baseUrl);
  });

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        if (serverProcess?.exitCode !== null) {
          resolve();
          return;
        }
        serverProcess.on('exit', () => resolve());
        setTimeout(() => {
          try {
            serverProcess?.kill('SIGKILL');
          } catch {}
          resolve();
        }, 1000);
      });
    }
  });

  beforeEach(() => {
    resetSyncStateForTests();
  });

  it('runs sync against live mock server and matches checkpoint through all sync scenarios', async () => {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

    function assertMatchesCheckpoint(store: any) {
      expect(Object.keys(store.byId).length).toBe(checkpoint.transaction_count);

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
    }

    const api = createApi(baseUrl);

    // 1. Initial full sync
    const initialResult = await syncAll({
      api,
      store: createEmptyStore(),
      syncToken: null,
      accounts: [],
    });

    assertMatchesCheckpoint(initialResult.store);

    // 2. Incremental sync with returned token
    const incrementalResult = await syncAll({
      api,
      store: initialResult.store,
      syncToken: initialResult.syncToken,
      accounts: initialResult.accounts,
    });

    assertMatchesCheckpoint(incrementalResult.store);

    // 3. incrementalSync with bogus token throws SyncTokenExpired
    await expect(
      incrementalSync(api, initialResult.store, 'st_bogus', initialResult.accounts)
    ).rejects.toThrow(SyncTokenExpired);

    // 4. syncAll with bogus token falls back to full sync and matches checkpoint
    const fallbackResult = await syncAll({
      api,
      store: initialResult.store,
      syncToken: 'st_bogus',
      accounts: initialResult.accounts,
    });

    assertMatchesCheckpoint(fallbackResult.store);
  }, 120_000);
});
