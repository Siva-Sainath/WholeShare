-- 003_coalitions_and_tokens.sql
-- Pure PostgreSQL tables for ACP Shared Payment Tokens and PayPal Dispute tracking.

CREATE TABLE IF NOT EXISTS shared_payment_tokens (
    token_id VARCHAR(64) PRIMARY KEY,
    sme_id VARCHAR(64) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    max_authorized_cents BIGINT NOT NULL CHECK (max_authorized_cents > 0),
    step_up_threshold_cents BIGINT NOT NULL CHECK (step_up_threshold_cents > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    signature VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispute_records (
    id BIGSERIAL PRIMARY KEY,
    paypal_dispute_id VARCHAR(64) NOT NULL UNIQUE,
    paypal_order_id VARCHAR(64),
    sme_id VARCHAR(64),
    coalition_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    reason TEXT,
    resolution_outcome VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shared_payment_tokens_sme ON shared_payment_tokens(sme_id);
CREATE INDEX IF NOT EXISTS idx_dispute_records_order ON dispute_records(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_dispute_records_coalition ON dispute_records(coalition_id);
