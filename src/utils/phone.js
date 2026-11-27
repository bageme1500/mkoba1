// Tanzanian mobile numbers come in many shapes: 0712 345 678, +255712345678,
// 255712345678, 712345678. Store and compare them all as 255XXXXXXXXX.
// Returns null when the input cannot be a full mobile number (e.g. masked 2557****678).
export function normalizePhone(input) {
    if (input === null || input === undefined) return null;
    const raw = String(input).trim();
    if (/[*xX]/.test(raw)) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('255')) return digits;
    if (digits.length === 10 && digits.startsWith('0')) return `255${digits.slice(1)}`;
    if (digits.length === 9 && !digits.startsWith('0')) return `255${digits}`;
    return null;
}
