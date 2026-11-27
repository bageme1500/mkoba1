// Shared zod building blocks for request validation.
import { z } from 'zod';
import { normalizePhone } from './phone.js';

export const id = z.coerce.number().int().positive();

export const money = z.coerce.number().finite().nonnegative().multipleOf(0.01, 'At most 2 decimal places');
export const positiveMoney = money.refine((n) => n > 0, 'Must be more than 0');

export const phone = z
    .string()
    .trim()
    .transform((v, ctx) => {
        const p = normalizePhone(v);
        if (!p) {
            ctx.addIssue({ code: 'custom', message: 'Enter a valid Tanzanian mobile number, e.g. 0712345678' });
            return z.NEVER;
        }
        return p;
    });

export const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Not a real date');

// "2026-03" -> "2026-03-01"
export const period = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM')
    .transform((s) => `${s}-01`);

export const year = z.coerce.number().int().min(2000).max(2100);

export const password = z.string().min(6, 'Password must be at least 6 characters').max(100);

export const optionalText = z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
