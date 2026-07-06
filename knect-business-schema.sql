-- ─────────────────────────────────────────────────────────────────
-- HAF KNECT — Business Account Schema
-- Supabase / PostgreSQL with Row Level Security
-- ─────────────────────────────────────────────────────────────────

-- 1. Business Accounts
CREATE TABLE business_accounts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name         TEXT        NOT NULL,
  companies_house_ref   TEXT        UNIQUE NOT NULL,
  contact_name          TEXT        NOT NULL,
  email                 TEXT        UNIQUE NOT NULL,
  phone                 TEXT        NOT NULL,
  goods_type            TEXT,
  send_frequency        TEXT,
  verified_status       TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (verified_status IN ('pending','verified','flagged','suspended')),
  cleverpay_verified_at TIMESTAMPTZ,
  rebate_tier           TEXT        NOT NULL DEFAULT 'none'
                          CHECK (rebate_tier IN ('none','starter','growth','key_account','custom')),
  custom_rebate_pct     NUMERIC(5,2),
  rebate_paused         BOOLEAN     NOT NULL DEFAULT false,
  flag_reason           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Approved Pickup Addresses
--    Jobs can ONLY be collected from addresses on this list.
--    Enforces the "own goods only" rule at the data layer.
CREATE TABLE business_approved_addresses (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id  UUID        NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
  label                TEXT        NOT NULL,
  full_address         TEXT        NOT NULL,
  postcode             TEXT,
  address_type         TEXT        NOT NULL DEFAULT 'other'
                         CHECK (address_type IN ('warehouse','store','office','supplier','other')),
  is_primary           BOOLEAN     NOT NULL DEFAULT false,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Business Jobs
--    goods_description and internal_reference are NOT NULL —
--    these are enforced at the UI layer too, but the DB is the backstop.
CREATE TABLE business_jobs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_ref              TEXT        UNIQUE NOT NULL,
  business_account_id  UUID        NOT NULL REFERENCES business_accounts(id),
  pickup_address_id    UUID        NOT NULL REFERENCES business_approved_addresses(id),
  delivery_address     TEXT        NOT NULL,
  goods_description    TEXT        NOT NULL,
  internal_reference   TEXT        NOT NULL,
  sender_name          TEXT        NOT NULL,
  vehicle_size         TEXT,
  weight_range         TEXT,
  urgency              TEXT        NOT NULL DEFAULT 'standard',
  collection_date      DATE        NOT NULL,
  collection_time      TIME,
  special_instructions TEXT,
  booking_type         TEXT        NOT NULL DEFAULT 'network'
                         CHECK (booking_type IN ('direct','network')),
  allocated_driver_id  TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','allocating','scheduled','in_transit','completed','cancelled','disputed','flagged')),
  price_estimate       NUMERIC(10,2),
  price_final          NUMERIC(10,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Business Flags (OTIS review queue)
CREATE TABLE business_flags (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id  UUID        NOT NULL REFERENCES business_accounts(id),
  flag_type            TEXT        NOT NULL
                         CHECK (flag_type IN (
                           'freight_forwarding',
                           'unrelated_sender',
                           'unapproved_address',
                           'industry_mismatch',
                           'multiple_external_customers',
                           'pricing_avoidance',
                           'manual'
                         )),
  flag_detail          TEXT,
  triggered_by         TEXT        NOT NULL DEFAULT 'otis'
                         CHECK (triggered_by IN ('otis','manual','driver','admin')),
  related_job_id       UUID        REFERENCES business_jobs(id),
  status               TEXT        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','reviewing','resolved','escalated')),
  resolved_by          TEXT,
  resolution_note      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Spend view (calculated from completed jobs — source of truth for rebate tier)
CREATE VIEW business_spend AS
SELECT
  ba.id                  AS business_account_id,
  ba.business_name,
  ba.rebate_tier,
  ba.rebate_paused,
  COUNT(bj.id)           AS total_completed_jobs,
  SUM(bj.price_final)    AS lifetime_spend,
  SUM(CASE WHEN DATE_TRUNC('month', bj.created_at) = DATE_TRUNC('month', NOW())
        THEN bj.price_final ELSE 0 END) AS monthly_spend,
  SUM(CASE WHEN bj.created_at >= NOW() - INTERVAL '7 days'
        THEN bj.price_final ELSE 0 END) AS weekly_spend,
  AVG(bj.price_final)    AS avg_job_value,
  COUNT(CASE WHEN bj.status = 'cancelled' THEN 1 END) AS cancelled_jobs
FROM business_accounts ba
LEFT JOIN business_jobs bj
  ON bj.business_account_id = ba.id
  AND bj.status = 'completed'
GROUP BY ba.id, ba.business_name, ba.rebate_tier, ba.rebate_paused;

-- 6. Auto-update rebate tier when a job completes
CREATE OR REPLACE FUNCTION fn_update_rebate_tier()
RETURNS TRIGGER AS $$
DECLARE
  v_lifetime NUMERIC;
BEGIN
  SELECT COALESCE(SUM(price_final), 0)
    INTO v_lifetime
    FROM business_jobs
   WHERE business_account_id = NEW.business_account_id
     AND status = 'completed';

  UPDATE business_accounts
     SET rebate_tier = CASE
           WHEN v_lifetime >= 10000 THEN 'key_account'
           WHEN v_lifetime >= 5000  THEN 'growth'
           WHEN v_lifetime >= 1000  THEN 'starter'
           ELSE 'none'
         END,
         updated_at = now()
   WHERE id = NEW.business_account_id
     AND rebate_paused = false;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rebate_tier
AFTER INSERT OR UPDATE OF status ON business_jobs
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION fn_update_rebate_tier();

-- 7. Row Level Security
ALTER TABLE business_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_approved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_flags            ENABLE ROW LEVEL SECURITY;

-- Business users see only their own data
CREATE POLICY biz_account_isolation ON business_accounts
  FOR ALL USING (
    id = auth.uid()::uuid
    OR auth.role() IN ('admin','otis','ops')
  );

CREATE POLICY biz_address_isolation ON business_approved_addresses
  FOR ALL USING (
    business_account_id = auth.uid()::uuid
    OR auth.role() IN ('admin','otis','ops')
  );

CREATE POLICY biz_job_isolation ON business_jobs
  FOR ALL USING (
    business_account_id = auth.uid()::uuid
    OR auth.role() IN ('admin','otis','ops')
  );

-- Flags are admin/OTIS only — never visible to the business account
CREATE POLICY biz_flag_admin_only ON business_flags
  FOR ALL USING (auth.role() IN ('admin','otis','ops'));

-- Indexes
CREATE INDEX idx_biz_jobs_account  ON business_jobs(business_account_id);
CREATE INDEX idx_biz_jobs_status   ON business_jobs(status);
CREATE INDEX idx_biz_jobs_created  ON business_jobs(created_at);
CREATE INDEX idx_biz_addrs_account ON business_approved_addresses(business_account_id);
CREATE INDEX idx_biz_flags_account ON business_flags(business_account_id);
CREATE INDEX idx_biz_flags_status  ON business_flags(status);
