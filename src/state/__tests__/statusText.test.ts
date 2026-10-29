import { buildStatusText, formatTimeAgo } from '../statusText';

describe('statusText', () => {
  const baseTime = Date.parse('2026-10-09T13:42:00Z');

  describe('formatTimeAgo', () => {
    it('returns "Updated just now" when within 60 seconds', () => {
      expect(formatTimeAgo(baseTime, baseTime + 10_000)).toBe('Updated just now');
      expect(formatTimeAgo(baseTime, baseTime + 59_000)).toBe('Updated just now');
    });

    it('returns "Updated 1 min ago" when between 1 and 2 minutes', () => {
      expect(formatTimeAgo(baseTime, baseTime + 65_000)).toBe('Updated 1 min ago');
    });

    it('returns "Updated X min ago" when under an hour', () => {
      expect(formatTimeAgo(baseTime, baseTime + 120_000)).toBe('Updated 2 min ago');
      expect(formatTimeAgo(baseTime, baseTime + 15 * 60_000)).toBe('Updated 15 min ago');
    });

    it('returns "Updated 1 hour ago" and "Updated X hours ago"', () => {
      expect(formatTimeAgo(baseTime, baseTime + 65 * 60_000)).toBe('Updated 1 hour ago');
      expect(formatTimeAgo(baseTime, baseTime + 3 * 3600_000)).toBe('Updated 3 hours ago');
    });
  });

  describe('buildStatusText', () => {
    it('returns syncing state with count when loaded records > 0', () => {
      expect(
        buildStatusText({
          status: 'syncing',
          lastSyncedAt: null,
          progress: { pagesLoaded: 12, recordsLoaded: 1240 },
        })
      ).toBe('Syncing… 1,240 loaded');
    });

    it('returns plain syncing state when no records loaded yet', () => {
      expect(
        buildStatusText({
          status: 'syncing',
          lastSyncedAt: null,
          progress: { pagesLoaded: 0, recordsLoaded: 0 },
        })
      ).toBe('Syncing…');
    });

    it('returns offline text with date when lastSyncedAt exists', () => {
      // 9 Oct 2026, 7:12 pm IST
      // 19:12 IST is 13:42 UTC
      const ms = Date.parse('2026-10-09T13:42:00Z');
      expect(
        buildStatusText({
          status: 'offline',
          lastSyncedAt: ms,
        })
      ).toBe('Offline - showing data from 9 Oct 2026, 7:12 pm');
    });

    it('returns offline text when no saved data', () => {
      expect(
        buildStatusText({
          status: 'offline',
          lastSyncedAt: null,
        })
      ).toBe('Offline - no saved data');
    });

    it('returns error text with "Showing saved data. Retry" when lastSyncedAt exists', () => {
      expect(
        buildStatusText({
          status: 'error',
          lastSyncedAt: 123456,
          lastError: new Error('server error'),
        })
      ).toBe("Couldn't refresh: server error. Showing saved data. Retry");
    });

    it('returns error text without saved data note when first launch error', () => {
      expect(
        buildStatusText({
          status: 'error',
          lastSyncedAt: null,
          lastError: new Error('network down'),
        })
      ).toBe("Couldn't refresh: network down. Retry");
    });

    it('returns idle text when idle', () => {
      const now = baseTime + 120_000;
      expect(
        buildStatusText({
          status: 'idle',
          lastSyncedAt: baseTime,
          now,
        })
      ).toBe('Updated 2 min ago');

      expect(
        buildStatusText({
          status: 'idle',
          lastSyncedAt: null,
        })
      ).toBe('Not synced yet');
    });
  });
});
