import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/utils/phone.js';
import { extractName, extractPhone, parseAmount, parseDate, readStatement, suggestMapping } from '../src/modules/imports/statement.parser.js';

describe('normalizePhone', () => {
    it.each([
        ['0712345678', '255712345678'],
        ['0712 345 678', '255712345678'],
        ['+255 712 345 678', '255712345678'],
        ['255712345678', '255712345678'],
        ['712345678', '255712345678'],
    ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

    it.each(['2557****678', '12345', '', null, '0812'])('rejects %s', (input) => expect(normalizePhone(input)).toBeNull());
});

describe('parseAmount', () => {
    it.each([
        ['50,000.00', 50000],
        ['50000', 50000],
        ['TZS 50,000', 50000],
        ['1,500.5', 1500.5],
        ['50.000,00', 50000],
        ['-2,000', -2000],
        ['(2,000.00)', -2000],
    ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));

    it.each(['', '-', 'abc', null])('returns null for %s', (input) => expect(parseAmount(input)).toBeNull());
});

describe('parseDate', () => {
    it.each([
        ['2026-03-05', '2026-03-05'],
        ['2026-03-05 14:22:10', '2026-03-05'],
        ['05/03/2026', '2026-03-05'],
        ['5-3-2026 09:00', '2026-03-05'],
        ['05.03.26', '2026-03-05'],
        ['46086', '2026-03-05'],
    ])('%s -> %s', (input, expected) => expect(parseDate(input)).toBe(expected));

    it.each(['31/11/2026', '2026-02-30', 'yesterday', ''])('rejects %s', (input) => expect(parseDate(input)).toBeNull());
});

describe('extractPhone / extractName', () => {
    it('finds a phone number inside M-Pesa details text', () => {
        const values = { Details: 'Funds received from - 0744 444 555 - BARAKA SAID', Amount: '30000' };
        expect(extractPhone(values)).toBe('255744444555');
        expect(extractName(values.Details)).toBe('BARAKA SAID');
    });

    it('prefers the mapped phone column', () => {
        expect(extractPhone({ Phone: '0712345678', Details: '255799999999' }, 'Phone')).toBe('255712345678');
    });

    it('ignores masked numbers', () => {
        expect(extractPhone({ Details: 'Funds received from - 2557****999 - X' })).toBeNull();
    });
});

describe('readStatement', () => {
    it('skips a title block and finds the header row', async () => {
        const csv = ['M-PESA STATEMENT', 'Customer Name:,GROUP', '', 'Receipt No.,Completion Time,Details,Paid In,Withdrawn', 'ABC1,05/11/2026 09:14,Funds received from - 0712345678 - ASHA,"50,000.00",'].join('\n');
        const parsed = await readStatement(Buffer.from(csv), 'statement.csv');
        expect(parsed.headers).toEqual(['Receipt No.', 'Completion Time', 'Details', 'Paid In', 'Withdrawn']);
        expect(parsed.rows).toHaveLength(1);
        expect(parsed.rows[0].values['Paid In']).toBe('50,000.00');
        expect(suggestMapping(parsed.headers)).toEqual({
            date: 'Completion Time',
            amount: 'Paid In',
            reference: 'Receipt No.',
            name: 'Details',
        });
    });

    it('reads semicolon-separated files', async () => {
        const parsed = await readStatement(Buffer.from('Date;Amount;Phone\n2026-03-01;1000;0712345678'), 'x.csv');
        expect(parsed.rows[0].values).toEqual({ Date: '2026-03-01', Amount: '1000', Phone: '0712345678' });
    });

    it('rejects other file types', async () => {
        await expect(readStatement(Buffer.from('x'), 'statement.pdf')).rejects.toThrow('Upload a .csv or .xlsx file');
    });
});
