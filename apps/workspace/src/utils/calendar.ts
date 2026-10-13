const key = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
export const localDay = (date: Date) => key(date.getFullYear(), date.getMonth() + 1, date.getDate());
export const calendarDate = (day: string) => new Date(`${day}T12:00:00Z`);
const utcDay = (date: Date) => key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
export function shiftMonth(month: string, delta: number): string {
  const date = calendarDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return utcDay(date).slice(0, 7);
}
export function monthDays(month: string): string[] {
  const date = calendarDate(`${month}-01`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 42 }, () => { const day = utcDay(date); date.setUTCDate(date.getUTCDate() + 1); return day; });
}
let chinese: Intl.DateTimeFormat | null = null;
try {
  const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  if (formatter.resolvedOptions().calendar === 'chinese') chinese = formatter;
} catch { /* Gregorian dates remain usable without Chinese calendar support. */ }
const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
export function lunarDate(day: string, compact = false): string {
  if (!chinese) return '';
  try {
    const parts = chinese.formatToParts(calendarDate(day));
    const month = parts.find(part => part.type === 'month')?.value || '';
    const number = Number(parts.find(part => part.type === 'day')?.value);
    const label = lunarDays[number - 1];
    return label ? (compact ? (number === 1 ? month : label) : `农历${month}${label}`) : '';
  } catch { return ''; }
}
