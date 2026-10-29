export const IST_OFFSET_MS = 19_800_000;

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getISTDate(ms: number): Date {
  return new Date(ms + IST_OFFSET_MS);
}

export function monthKey(ms: number): string {
  const d = getISTDate(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function monthLabel(key: string): string {
  const [yearStr, monthStr] = key.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthName = FULL_MONTHS[monthIdx] || monthStr;
  return `${monthName} ${yearStr}`;
}

export function formatISTDate(ms: number): string {
  const d = getISTDate(ms);
  const day = d.getUTCDate();
  const month = SHORT_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  let hours = d.getUTCHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }

  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}
