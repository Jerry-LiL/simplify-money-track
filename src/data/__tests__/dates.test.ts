import { formatISTDate, getISTDate, monthKey, monthLabel } from '../dates';

describe('dates', () => {
  it('identifies 2026-03-31T18:40:00Z as April in IST', () => {
    // 18:40 UTC + 5h30m = 00:10 next day (1 April) in IST
    const ms = Date.parse('2026-03-31T18:40:00Z');
    expect(monthKey(ms)).toBe('2026-04');
    expect(monthLabel('2026-04')).toBe('April 2026');

    const ist = getISTDate(ms);
    expect(ist.getUTCFullYear()).toBe(2026);
    expect(ist.getUTCMonth()).toBe(3); // 0-indexed: 3 is April
    expect(ist.getUTCDate()).toBe(1);
  });

  it('identifies 2025-09-30T19:02:00Z (legacy unix 1759258920) as October 2025 in IST', () => {
    // 19:02 UTC + 5h30m = 00:32 next day (1 October) in IST
    const legacyUnixSeconds = 1759258920;
    const ms = legacyUnixSeconds * 1000;
    expect(monthKey(ms)).toBe('2025-10');
    expect(monthLabel('2025-10')).toBe('October 2025');

    const ist = getISTDate(ms);
    expect(ist.getUTCFullYear()).toBe(2025);
    expect(ist.getUTCMonth()).toBe(9); // 0-indexed: 9 is October
    expect(ist.getUTCDate()).toBe(1);
  });

  it('formats dates in IST: "9 Oct 2026, 7:12 pm"', () => {
    const ms = Date.parse('2026-10-09T13:42:00Z');
    // 13:42 UTC + 5h30m = 19:12 IST = 7:12 pm
    expect(formatISTDate(ms)).toBe('9 Oct 2026, 7:12 pm');
  });

  it('formats morning dates in IST correctly with am', () => {
    const ms = Date.parse('2026-10-09T03:05:00Z');
    // 03:05 UTC + 5h30m = 08:35 IST = 8:35 am
    expect(formatISTDate(ms)).toBe('9 Oct 2026, 8:35 am');
  });

  it('formats midnight and noon hours correctly', () => {
    // 18:30 UTC = 00:00 IST = 12:00 am next day
    const midnight = Date.parse('2026-10-08T18:30:00Z');
    expect(formatISTDate(midnight)).toBe('9 Oct 2026, 12:00 am');

    // 06:30 UTC = 12:00 IST = 12:00 pm same day
    const noon = Date.parse('2026-10-09T06:30:00Z');
    expect(formatISTDate(noon)).toBe('9 Oct 2026, 12:00 pm');
  });
});
