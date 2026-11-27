-- Round 2: payment order setting, automatic months, cash book, approvals,
-- member-submitted payments, audit log and session control.

-- ---------- group settings ----------
ALTER TABLE groups
    -- Where a payment goes when no month is chosen:
    --   current_first: the month it was paid in, then the oldest open months
    --   oldest_first:  the oldest open month first
    ADD COLUMN allocation_rule TEXT NOT NULL DEFAULT 'current_first'
        CHECK (allocation_rule IN ('current_first', 'oldest_first')),
    -- Start each month automatically on the 1st.
    ADD COLUMN auto_start BOOLEAN NOT NULL DEFAULT true,
    -- Money already in the group's M-Koba when it started using this system.
    ADD COLUMN opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN opening_balance_date DATE;

-- ---------- users ----------
ALTER TABLE users
    -- Bumped to log a user out of every device (password change, "log out everywhere").
    ADD COLUMN token_version INT NOT NULL DEFAULT 0,
    ADD COLUMN language TEXT NOT NULL DEFAULT 'sw' CHECK (language IN ('sw', 'en'));

-- Payments can now also come from a member's own submission (approved by a leader).
ALTER TABLE payments DROP CONSTRAINT payments_source_check;
ALTER TABLE payments ADD CONSTRAINT payments_source_check CHECK (source IN ('manual', 'import', 'member'));

-- ---------- cash book: money in/out other than member contributions ----------
CREATE TABLE cash_entries (
    id            SERIAL PRIMARY KEY,
    group_id      INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    category      TEXT NOT NULL CHECK (category IN (
                      'withdrawal', 'expense', 'charges', 'payout', 'other_out',
                      'other_income', 'adjustment')),
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    occurred_at   DATE NOT NULL,
    description   TEXT NOT NULL,
    reference     TEXT,
    -- Money out waits for a second leader; only approved entries count in the balance.
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    created_by    INT REFERENCES users(id) ON DELETE SET NULL,
    approved_by   INT REFERENCES users(id) ON DELETE SET NULL,
    approved_at   TIMESTAMPTZ,
    reject_reason TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cash_entries_group_idx ON cash_entries (group_id, occurred_at);
CREATE UNIQUE INDEX cash_entries_reference_uq ON cash_entries (group_id, reference)
    WHERE reference IS NOT NULL AND status <> 'rejected';

-- Real M-Koba balance checked against what the system expects.
CREATE TABLE balance_checks (
    id               SERIAL PRIMARY KEY,
    group_id         INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    checked_on       DATE NOT NULL,
    actual_balance   NUMERIC(12,2) NOT NULL,
    expected_balance NUMERIC(12,2) NOT NULL,
    note             TEXT,
    created_by       INT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX balance_checks_group_idx ON balance_checks (group_id, checked_on DESC);

-- Statement rows for withdrawals/charges become pending cash book entries.
ALTER TABLE import_rows DROP CONSTRAINT import_rows_status_check;
ALTER TABLE import_rows ADD CONSTRAINT import_rows_status_check
    CHECK (status IN ('matched', 'duplicate', 'unmatched', 'invalid', 'skipped', 'cashbook'));
ALTER TABLE import_rows ADD COLUMN cash_entry_id INT REFERENCES cash_entries(id) ON DELETE SET NULL;
ALTER TABLE statement_imports ADD COLUMN cashbook_rows INT NOT NULL DEFAULT 0;

-- ---------- members report their own payments ----------
CREATE TABLE payment_submissions (
    id            SERIAL PRIMARY KEY,
    group_id      INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_at       DATE NOT NULL,
    method        TEXT NOT NULL DEFAULT 'mpesa' CHECK (method IN ('mpesa', 'cash', 'bank')),
    reference     TEXT,
    period        DATE,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by   INT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at   TIMESTAMPTZ,
    reject_reason TEXT,
    payment_id    INT REFERENCES payments(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_submissions_group_idx ON payment_submissions (group_id, status, created_at DESC);
CREATE UNIQUE INDEX payment_submissions_pending_reference_uq ON payment_submissions (group_id, reference)
    WHERE reference IS NOT NULL AND status = 'pending';

-- ---------- audit log ----------
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    group_id   INT REFERENCES groups(id) ON DELETE CASCADE,
    -- NULL actor = done by the system (e.g. automatic month start).
    actor_id   INT REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  INT,
    -- Member the change is about, so a member's history can be shown.
    subject_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    summary    TEXT NOT NULL,
    before     JSONB,
    after      JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_group_idx ON audit_log (group_id, created_at DESC);
CREATE INDEX audit_log_subject_idx ON audit_log (subject_user_id, created_at DESC);
