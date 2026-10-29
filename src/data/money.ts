export function parseDecimalToMinor(val: unknown): number | null {
  if (typeof val !== 'string') {
    return null;
  }

  const trimmed = val.trim();
  if (!trimmed) {
    return null;
  }

  let sign = 1;
  let s = trimmed;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  if (!s) {
    return null;
  }

  s = s.replace(/,/g, '');

  const parts = s.split('.');
  if (parts.length > 2) {
    return null;
  }

  const whole = parts[0];
  const frac = parts.length === 2 ? parts[1] : '';

  if (whole === '' && frac === '') {
    return null;
  }

  if (whole !== '' && !/^\d+$/.test(whole)) {
    return null;
  }

  if (frac.length > 2 || (frac !== '' && !/^\d+$/.test(frac))) {
    return null;
  }

  const fracPadded = frac.padEnd(2, '0');
  const wholeInt = whole === '' ? 0 : parseInt(whole, 10);
  const fracInt = parseInt(fracPadded, 10);

  if (!Number.isSafeInteger(wholeInt)) {
    return null;
  }

  // Integer arithmetic only: whole rupees * 100 paise + fractional paise
  const minor = wholeInt * 100 + fracInt;
  return sign * minor;
}

export function formatINR(paise: number, opts?: { showPaise?: boolean }): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;
  const paiseStr = String(remPaise).padStart(2, '0');

  let rupeesStr: string;
  if (rupees < 1000) {
    rupeesStr = String(rupees);
  } else {
    // Indian grouping: last 3 digits, then groups of 2 digits
    const last3 = String(rupees % 1000).padStart(3, '0');
    let rest = Math.floor(rupees / 1000);
    const groups: string[] = [];

    while (rest > 0) {
      if (rest >= 100) {
        groups.unshift(String(rest % 100).padStart(2, '0'));
        rest = Math.floor(rest / 100);
      } else {
        groups.unshift(String(rest));
        rest = 0;
      }
    }

    rupeesStr = `${groups.join(',')},${last3}`;
  }

  const showPaise = opts?.showPaise ?? true;
  const decimalPart = showPaise ? `.${paiseStr}` : '';
  const prefix = isNegative ? '-₹' : '₹';

  return `${prefix}${rupeesStr}${decimalPart}`;
}

export function formatForeign(amountMinor: number, currency: string): string {
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const upperCurr = currency.toUpperCase();
  const isZeroDec = upperCurr === 'JPY' || upperCurr === 'KRW';

  let formatted: string;
  if (isZeroDec) {
    formatted = formatStandardGrouping(abs);
  } else {
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    formatted = `${formatStandardGrouping(whole)}.${frac}`;
  }

  const prefix = isNegative ? '-' : '';
  if (upperCurr === 'USD') {
    return `${prefix}US$${formatted}`;
  }

  return `${prefix}${upperCurr} ${formatted}`;
}

function formatStandardGrouping(val: number): string {
  return String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
