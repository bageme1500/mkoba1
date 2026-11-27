import { describe, expect, it } from 'vitest';
import { allocate } from '../src/modules/payments/allocation.js';

const due = (id, month, extra = {}) => ({
    id,
    period: `2026-${month}-01`,
    due_date: `2026-${month}-28`,
    required_amount: 50000,
    late_fine: 2000,
    ...extra,
});
const payment = (id, amount, paid_at, due_id = null) => ({ id, amount, paid_at, due_id });

const byDue = (allocations) => {
    const totals = {};
    for (const a of allocations) totals[a.due_id] = (totals[a.due_id] || 0) + a.amount;
    return totals;
};

describe('allocate', () => {
    it('applies a full on-time payment to its month, with no fine', () => {
        const { allocations, credit } = allocate([due(1, '03')], [payment(1, 50000, '2026-03-20')]);
        expect(byDue(allocations)).toEqual({ 1: 50000 });
        expect(credit).toBe(0);
    });

    it('fills the oldest open month first', () => {
        const { allocations } = allocate([due(2, '04'), due(1, '03')], [payment(1, 50000, '2026-03-10'), payment(2, 30000, '2026-04-10')]);
        expect(byDue(allocations)).toEqual({ 1: 50000, 2: 30000 });
    });

    it('spreads one payment over several months', () => {
        const { allocations, credit } = allocate([due(1, '03'), due(2, '04')], [payment(1, 100000, '2026-03-10')]);
        expect(byDue(allocations)).toEqual({ 1: 50000, 2: 50000 });
        expect(credit).toBe(0);
    });

    it('lets a late payment also cover the fine', () => {
        const { allocations } = allocate([due(1, '03')], [payment(1, 52000, '2026-04-02')]);
        expect(byDue(allocations)).toEqual({ 1: 52000 });
    });

    it('does not take a fine from an on-time payment', () => {
        const { allocations, credit } = allocate([due(1, '03')], [payment(1, 52000, '2026-03-28')]);
        expect(byDue(allocations)).toEqual({ 1: 50000 });
        expect(credit).toBe(2000);
    });

    it('charges the fine when only part was paid by the deadline', () => {
        // 30k on time, the rest after the deadline: month can take 50k + 2k fine.
        const { allocations } = allocate([due(1, '03')], [payment(1, 30000, '2026-03-20'), payment(2, 30000, '2026-04-05')]);
        expect(byDue(allocations)).toEqual({ 1: 52000 });
    });

    it('keeps money beyond every month as credit', () => {
        const { credit } = allocate([due(1, '03')], [payment(1, 70000, '2026-03-01')]);
        expect(credit).toBe(20000);
    });

    it('sends a payment to the month the leader chose first', () => {
        const { allocations } = allocate([due(1, '03'), due(2, '04')], [payment(1, 50000, '2026-04-10', 2)]);
        expect(byDue(allocations)).toEqual({ 2: 50000 });
    });

    it('overflows a targeted payment to the oldest other month', () => {
        const { allocations } = allocate([due(1, '03'), due(2, '04')], [payment(1, 60000, '2026-04-10', 2)]);
        expect(byDue(allocations)).toEqual({ 2: 50000, 1: 10000 });
    });

    it('treats a waived month (0 required) as paid with no fine', () => {
        const { allocations, credit } = allocate([due(1, '03', { required_amount: 0 })], [payment(1, 1000, '2026-04-01')]);
        expect(allocations).toEqual([]);
        expect(credit).toBe(1000);
    });

    it('handles cents without rounding errors', () => {
        // 0.1 + 0.2 !== 0.3 in floating point; working in cents must still fill the month exactly.
        const { allocations, credit } = allocate([due(1, '03', { required_amount: 0.3 })], [payment(1, 0.1, '2026-03-01'), payment(2, 0.2, '2026-03-02'), payment(3, 0.05, '2026-03-03')]);
        expect(allocations).toEqual([
            { payment_id: 1, due_id: 1, amount: 0.1 },
            { payment_id: 2, due_id: 1, amount: 0.2 },
        ]);
        expect(credit).toBe(0.05);
    });
});
