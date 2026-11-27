-- Uploaded M-Pesa / M-Koba statements and what happened to each row.

CREATE TABLE statement_imports (
    id             SERIAL PRIMARY KEY,
    group_id       INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    uploaded_by    INT REFERENCES users(id) ON DELETE SET NULL,
    mapping        JSONB NOT NULL,
    total_rows     INT NOT NULL DEFAULT 0,
    matched_rows   INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    unmatched_rows INT NOT NULL DEFAULT 0,
    invalid_rows   INT NOT NULL DEFAULT 0,
    skipped_rows   INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX statement_imports_group_idx ON statement_imports (group_id, created_at DESC);

CREATE TABLE import_rows (
    id         SERIAL PRIMARY KEY,
    import_id  INT NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    raw        JSONB NOT NULL,
    paid_at    DATE,
    phone      TEXT,
    payer_name TEXT,
    amount     NUMERIC(12,2),
    reference  TEXT,
    -- matched:   recorded as a payment
    -- duplicate: reference already recorded (or repeated in the file)
    -- unmatched: deposit, but no member found; a leader can assign it
    -- invalid:   date or amount could not be read
    -- skipped:   not a deposit (withdrawal, charge, empty) or dismissed by a leader
    status     TEXT NOT NULL CHECK (status IN ('matched', 'duplicate', 'unmatched', 'invalid', 'skipped')),
    message    TEXT,
    user_id    INT REFERENCES users(id) ON DELETE SET NULL,
    payment_id INT REFERENCES payments(id) ON DELETE SET NULL
);
CREATE INDEX import_rows_import_idx ON import_rows (import_id, row_number);
