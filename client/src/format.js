import { getLang } from './i18n.jsx';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const money = (n, currency = 'TZS') => (n === null || n === undefined ? '-' : `${currency} ${number.format(n)}`);
export const amount = (n) => (n === null || n === undefined ? '-' : number.format(n));

const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    sw: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
};
const SHORT = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    sw: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'],
};
const months = () => MONTHS[getLang()] || MONTHS.en;
const short = () => SHORT[getLang()] || SHORT.en;

// '2026-03' or '2026-03-01' -> 'March 2026' / 'Machi 2026'
export function monthLabel(period) {
    if (!period) return '';
    const [y, m] = period.split('-').map(Number);
    return `${months()[m - 1]} ${y}`;
}
export const monthName = (period) => months()[Number(period.split('-')[1]) - 1];
export const shortMonth = (period) => short()[Number(period.split('-')[1]) - 1];

// '2026-03-05' -> '5 Mar 2026'
export function dateLabel(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d} ${short()[m - 1]} ${y}`;
}

export function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const thisMonth = () => todayIso().slice(0, 7);

// '2026-03' + 1 -> '2026-04'
export function addMonths(period, n) {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 255712345678 -> 0712 345 678
export function phoneLabel(p) {
    if (!p || p.length !== 12) return p || '';
    const local = `0${p.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

// '2026-02' -> '2026-02-28'
export function monthEnd(period) {
    const [y, m] = period.split('-').map(Number);
    return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// 1 -> '1st', 22 -> '22nd' in English; plain number in Kiswahili ("tarehe 28").
export function ordinal(n) {
    if (getLang() === 'sw') return String(n);
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
    return `${n}${suffix}`;
}
