import { formatForeign, formatINR, parseDecimalToMinor } from '../money';

describe('money', () => {
  describe('parseDecimalToMinor', () => {
    it('parses valid decimal strings without floating point', () => {
      expect(parseDecimalToMinor('516.49')).toBe(51649);
      expect(parseDecimalToMinor('0.10')).toBe(10);
      expect(parseDecimalToMinor('1,234.5')).toBe(123450);
      expect(parseDecimalToMinor('100')).toBe(10000);
      expect(parseDecimalToMinor('0')).toBe(0);
      expect(parseDecimalToMinor('0.00')).toBe(0);
      expect(parseDecimalToMinor('.5')).toBe(50);
    });

    it('parses negative and positive signed amounts', () => {
      expect(parseDecimalToMinor('-516.49')).toBe(-51649);
      expect(parseDecimalToMinor('+516.49')).toBe(51649);
      expect(parseDecimalToMinor('-0.50')).toBe(-50);
    });

    it('rejects garbage and invalid formats', () => {
      expect(parseDecimalToMinor('abc')).toBeNull();
      expect(parseDecimalToMinor('1.2.3')).toBeNull();
      expect(parseDecimalToMinor('12.345')).toBeNull();
      expect(parseDecimalToMinor('')).toBeNull();
      expect(parseDecimalToMinor('   ')).toBeNull();
      expect(parseDecimalToMinor('-')).toBeNull();
      expect(parseDecimalToMinor(null)).toBeNull();
      expect(parseDecimalToMinor(undefined)).toBeNull();
      expect(parseDecimalToMinor(100 as any)).toBeNull();
    });

    it('avoids 0.29 + 0.01 floating point traps when summing minor integers', () => {
      // 0.10 in float: 0.1 + 0.1 + 0.1 === 0.30000000000000004
      const p1 = parseDecimalToMinor('0.10')!;
      const p2 = parseDecimalToMinor('0.10')!;
      const p3 = parseDecimalToMinor('0.10')!;
      expect(p1 + p2 + p3).toBe(30);

      const f1 = parseDecimalToMinor('0.29')!;
      const f2 = parseDecimalToMinor('0.01')!;
      expect(f1 + f2).toBe(30);
    });
  });

  describe('formatINR', () => {
    it('formats Indian rupee amounts with lakh and crore grouping', () => {
      expect(formatINR(12345678)).toBe('₹1,23,456.78');
      expect(formatINR(100)).toBe('₹1.00');
      expect(formatINR(1234567890)).toBe('₹1,23,45,678.90');
      expect(formatINR(0)).toBe('₹0.00');
      expect(formatINR(50)).toBe('₹0.50');
      expect(formatINR(5)).toBe('₹0.05');
      expect(formatINR(99900)).toBe('₹999.00');
      expect(formatINR(100000)).toBe('₹1,000.00');
      expect(formatINR(10000000)).toBe('₹1,00,000.00');
    });

    it('formats negative amounts with leading minus sign', () => {
      expect(formatINR(-12345678)).toBe('-₹1,23,456.78');
      expect(formatINR(-100)).toBe('-₹1.00');
      expect(formatINR(-50)).toBe('-₹0.50');
    });

    it('supports hiding paise via options', () => {
      expect(formatINR(12345678, { showPaise: false })).toBe('₹1,23,456');
    });
  });

  describe('formatForeign', () => {
    it('formats 2-decimal currencies and handles USD specially', () => {
      expect(formatForeign(1000, 'USD')).toBe('US$10.00');
      expect(formatForeign(1000, 'EUR')).toBe('EUR 10.00');
      expect(formatForeign(-1000, 'USD')).toBe('-US$10.00');
      expect(formatForeign(123456, 'USD')).toBe('US$1,234.56');
    });

    it('formats zero-decimal currencies like JPY and KRW', () => {
      expect(formatForeign(1000, 'JPY')).toBe('JPY 1,000');
      expect(formatForeign(50000, 'KRW')).toBe('KRW 50,000');
      expect(formatForeign(-1500, 'JPY')).toBe('-JPY 1,500');
    });
  });
});
