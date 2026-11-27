-- M-Koba tracker: core schema.
-- Money is NUMERIC(12,2) in the group's currency (TZS by default).

CREATE TABLE groups (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    monthly_amount NUMERIC(12,2) NOT NULL CHECK (monthly_amount > 0),
    -- Day of the month every member must have paid by (1-28 so it exists in every month).
    due_day        SMALLINT NOT NULL DEFAULT 28 CHECK (due_day BETWEEN 1 AND 28),
    -- Fine added once to a month's balance when it was not fully paid by the deadline.
    late_fine      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_fine >= 0),
    currency       TEXT NOT NULL DEFAULT 'TZS',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    -- NULL only for system admins, who are not part of a group.
    group_id      INT REFERENCES groups(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    -- Stored normalised as 255XXXXXXXXX so statement rows can be matched to members.
    phone         TEXT NOT NULL UNIQUE,
    email         TEXT,
    -- NULL means the member cannot log in (leader tracks them only).
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'leader', 'member')),
    active        BOOLEAN NOT NULL DEFAULT true,
    joined_at     DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (role = 'admin' OR group_id IS NOT NULL)
);
CREATE INDEX users_group_idx ON users (group_id);

-- One row per member per month: what they owe and by when.
-- Amount and fine are copied from the group when the month is generated,
-- so changing group settings later does not rewrite past months.
CREATE TABLE dues (
    id              SERIAL PRIMARY KEY,
    group_id        INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period          DATE NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
    required_amount NUMERIC(12,2) NOT NULL CHECK (required_amount >= 0),
    late_fine       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_fine >= 0),
    due_date        DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, period)
);
CREATE INDEX dues_group_period_idx ON dues (group_id, period);

-- Money a member actually deposited.
CREATE TABLE payments (
    id          SERIAL PRIMARY KEY,
    group_id    INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Optional month the leader said this payment is for; otherwise it pays the oldest open month.
    due_id      INT REFERENCES dues(id) ON DELETE SET NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at     DATE NOT NULL,
    method      TEXT NOT NULL DEFAULT 'mpesa' CHECK (method IN ('mpesa', 'cash', 'bank')),
    reference   TEXT,
    note        TEXT,
    source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_idx ON payments (user_id);
-- The same M-Pesa reference can only be recorded once per group (stops double imports).
CREATE UNIQUE INDEX payments_group_reference_uq ON payments (group_id, reference) WHERE reference IS NOT NULL;

-- How each payment is spread over months. One payment can cover several months
-- (e.g. a member pays two months at once); money left over stays as credit.
CREATE TABLE allocations (
    id         SERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    due_id     INT NOT NULL REFERENCES dues(id) ON DELETE CASCADE,
    amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX allocations_due_idx ON allocations (due_id);
CREATE INDEX allocations_payment_idx ON allocations (payment_id);

-- Status of every month for every member, worked out on read so it is never stale.
--   fine:    the month's late_fine once the deadline has passed without the full amount paid
--   balance: required + fine - paid
--   status:  paid | partial | unpaid
--   is_late: deadline passed without the full required amount paid by then
CREATE VIEW due_status AS
WITH sums AS (
    SELECT d.id,
           COALESCE(SUM(a.amount), 0) AS paid_total,
           COALESCE(SUM(a.amount) FILTER (WHERE p.paid_at <= d.due_date), 0) AS paid_by_deadline,
           MAX(p.paid_at) AS last_paid_at
    FROM dues d
    LEFT JOIN allocations a ON a.due_id = d.id
    LEFT JOIN payments p ON p.id = a.payment_id
    GROUP BY d.id
), flagged AS (
    SELECT d.*, s.paid_total, s.paid_by_deadline, s.last_paid_at,
           (CURRENT_DATE > d.due_date AND s.paid_by_deadline < d.required_amount) AS is_late
    FROM dues d JOIN sums s ON s.id = d.id
), fined AS (
    SELECT f.*, CASE WHEN f.is_late THEN f.late_fine ELSE 0 END AS fine
    FROM flagged f
)
SELECT fined.*,
       GREATEST(fined.required_amount + fined.fine - fined.paid_total, 0) AS balance,
       CASE
           WHEN fined.paid_total >= fined.required_amount + fined.fine THEN 'paid'
           WHEN fined.paid_total > 0 THEN 'partial'
           ELSE 'unpaid'
       END AS status
FROM fined;
