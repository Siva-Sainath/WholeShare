CREATE TABLE IF NOT EXISTS coalitions (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL,
    sku_name VARCHAR(255) NOT NULL,
    target_units INTEGER NOT NULL,
    current_units INTEGER NOT NULL DEFAULT 0,
    unit_price_cents BIGINT NOT NULL,
    discount_tier_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'FORMING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coalition_members (
    id VARCHAR(64) PRIMARY KEY,
    coalition_id VARCHAR(64) NOT NULL REFERENCES coalitions(id) ON DELETE CASCADE,
    buyer_id VARCHAR(64) NOT NULL,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    pledged_units INTEGER NOT NULL,
    authorized_cents BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PLEDGED',
    callback_url TEXT,
    paypal_order_id VARCHAR(64),
    step_up_required BOOLEAN NOT NULL DEFAULT FALSE,
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    coalition_id VARCHAR(64) NOT NULL REFERENCES coalitions(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coalitions_sku ON coalitions(sku);
CREATE INDEX IF NOT EXISTS idx_coalitions_status ON coalitions(status);
CREATE INDEX IF NOT EXISTS idx_coalition_members_coalition_id ON coalition_members(coalition_id);
CREATE INDEX IF NOT EXISTS idx_coalition_members_buyer_id ON coalition_members(buyer_id);
