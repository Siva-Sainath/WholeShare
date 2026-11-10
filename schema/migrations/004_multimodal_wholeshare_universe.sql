-- 004_multimodal_wholeshare_universe.sql
-- Relational entities and vector storage for WholeShare global B2B pre-populated universe.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sme_profiles (
    id VARCHAR(64) PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    country_code VARCHAR(2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    naics_code VARCHAR(6) NOT NULL,
    industry_vertical VARCHAR(64) NOT NULL,
    monthly_spend_cents BIGINT NOT NULL CHECK (monthly_spend_cents >= 0),
    demand_embedding vector(1024),
    paypal_payer_id VARCHAR(64),
    max_auto_authorize_cents BIGINT NOT NULL CHECK (max_auto_authorize_cents > 0),
    step_up_threshold_cents BIGINT NOT NULL CHECK (step_up_threshold_cents > 0),
    credit_tier VARCHAR(16) NOT NULL DEFAULT 'TIER_1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sme_ingested_documents (
    id VARCHAR(64) PRIMARY KEY,
    sme_id VARCHAR(64) NOT NULL REFERENCES sme_profiles(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(32) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    parsed_payload JSONB NOT NULL,
    raw_ocr_text TEXT,
    extracted_line_items JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    industry_vertical VARCHAR(64) NOT NULL,
    credibility_score NUMERIC(4, 2) NOT NULL CHECK (credibility_score >= 0.00 AND credibility_score <= 10.00),
    verified_tax_id VARCHAR(64) NOT NULL,
    paypal_receiver_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_skus (
    sku VARCHAR(64) PRIMARY KEY,
    supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    hs6_code VARCHAR(6) NOT NULL,
    incoterm VARCHAR(3) NOT NULL CHECK (incoterm IN ('FOB', 'CIF', 'DDP', 'EXW', 'FCA', 'DAP')),
    lead_time_days INTEGER NOT NULL CHECK (lead_time_days > 0),
    base_price_cents BIGINT NOT NULL CHECK (base_price_cents > 0),
    currency VARCHAR(3) NOT NULL,
    moq_tier1_units INTEGER NOT NULL CHECK (moq_tier1_units > 0),
    moq_tier1_price_cents BIGINT NOT NULL CHECK (moq_tier1_price_cents < base_price_cents),
    moq_tier2_units INTEGER NOT NULL CHECK (moq_tier2_units > moq_tier1_units),
    moq_tier2_price_cents BIGINT NOT NULL CHECK (moq_tier2_price_cents < moq_tier1_price_cents),
    moq_tier3_units INTEGER NOT NULL CHECK (moq_tier3_units > moq_tier2_units),
    moq_tier3_price_cents BIGINT NOT NULL CHECK (moq_tier3_price_cents < moq_tier2_price_cents),
    sku_embedding vector(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_corridors (
    id VARCHAR(64) PRIMARY KEY,
    origin_country VARCHAR(2) NOT NULL,
    origin_hub VARCHAR(255) NOT NULL,
    destination_country VARCHAR(2) NOT NULL,
    destination_hub VARCHAR(255) NOT NULL,
    corridor_type VARCHAR(16) NOT NULL CHECK (corridor_type IN ('DOMESTIC', 'CROSS_BORDER')),
    customs_duty_bps INTEGER NOT NULL DEFAULT 0,
    transit_days_min INTEGER NOT NULL,
    transit_days_max INTEGER NOT NULL,
    freight_rate_cents_per_unit BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fx_rates (
    pair VARCHAR(7) PRIMARY KEY,
    base_currency VARCHAR(3) NOT NULL,
    quote_currency VARCHAR(3) NOT NULL,
    rate_bps BIGINT NOT NULL,
    decimal_places INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clans (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL REFERENCES supplier_skus(sku),
    industry_vertical VARCHAR(64) NOT NULL,
    corridor_id VARCHAR(64) NOT NULL REFERENCES trade_corridors(id),
    target_units INTEGER NOT NULL CHECK (target_units > 0),
    current_units INTEGER NOT NULL DEFAULT 0,
    unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
    currency VARCHAR(3) NOT NULL,
    discount_tier_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'FORMING',
    leader_id VARCHAR(64) NOT NULL REFERENCES sme_profiles(id),
    capacity_ratio NUMERIC(5, 4) NOT NULL CHECK (capacity_ratio >= 0.6500 AND capacity_ratio <= 0.9200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clan_members (
    id VARCHAR(64) PRIMARY KEY,
    clan_id VARCHAR(64) NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    sme_id VARCHAR(64) NOT NULL REFERENCES sme_profiles(id) ON DELETE CASCADE,
    pledged_units INTEGER NOT NULL CHECK (pledged_units > 0),
    authorized_cents BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PLEDGED',
    paypal_order_id VARCHAR(64),
    step_up_required BOOLEAN NOT NULL DEFAULT FALSE,
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sme_industry ON sme_profiles(industry_vertical);
CREATE INDEX IF NOT EXISTS idx_sme_country ON sme_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_industry ON suppliers(industry_vertical);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers(country_code);
CREATE INDEX IF NOT EXISTS idx_clans_industry ON clans(industry_vertical);
CREATE INDEX IF NOT EXISTS idx_clans_corridor ON clans(corridor_id);
CREATE INDEX IF NOT EXISTS idx_clans_status ON clans(status);
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_sme ON clan_members(sme_id);

