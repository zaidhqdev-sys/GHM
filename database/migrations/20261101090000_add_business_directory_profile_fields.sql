-- Directory profile metadata; category remains normalized through business_category_assignment.
-- Trust, verification, promotion, media references and analytics remain server-governed.
-- Source-only reconciliation: do not execute against production or any live database.

ALTER TABLE ghm.business
  ADD COLUMN province text,
  ADD COLUMN city text,
  ADD COLUMN physical_address text,
  ADD COLUMN whatsapp text,
  ADD COLUMN website text,
  ADD COLUMN logo_url text,
  ADD COLUMN avatar_letter text,
  ADD COLUMN avatar_color text,
  ADD COLUMN is_supplier boolean,
  ADD COLUMN tier text NOT NULL DEFAULT 'free',
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN profile_views bigint NOT NULL DEFAULT 0,
  ADD COLUMN years_in_business integer NOT NULL DEFAULT 0;

ALTER TABLE ghm.business
  ADD CONSTRAINT business_directory_province_check
    CHECK (province IS NULL OR length(btrim(province)) BETWEEN 1 AND 100),
  ADD CONSTRAINT business_directory_city_check
    CHECK (city IS NULL OR length(btrim(city)) BETWEEN 1 AND 120),
  ADD CONSTRAINT business_directory_address_check
    CHECK (physical_address IS NULL OR length(physical_address) <= 500),
  ADD CONSTRAINT business_directory_whatsapp_check
    CHECK (whatsapp IS NULL OR length(btrim(whatsapp)) BETWEEN 7 AND 32),
  ADD CONSTRAINT business_directory_website_check
    CHECK (website IS NULL OR (length(btrim(website)) BETWEEN 1 AND 2048 AND website ~* '^https?://')),
  ADD CONSTRAINT business_directory_logo_url_check
    CHECK (logo_url IS NULL OR length(btrim(logo_url)) BETWEEN 1 AND 2048),
  ADD CONSTRAINT business_directory_avatar_letter_check
    CHECK (avatar_letter IS NULL OR length(btrim(avatar_letter)) BETWEEN 1 AND 3),
  ADD CONSTRAINT business_directory_avatar_color_check
    CHECK (avatar_color IS NULL OR avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT business_directory_tier_check
    CHECK (tier IN ('free', 'verified', 'featured', 'premium')),
  ADD CONSTRAINT business_directory_profile_views_check
    CHECK (profile_views >= 0),
  ADD CONSTRAINT business_directory_years_in_business_check
    CHECK (years_in_business BETWEEN 0 AND 500);

COMMENT ON COLUMN ghm.business.is_supplier IS
  'Self-declared directory classification; not an authorization or verification claim.';
COMMENT ON COLUMN ghm.business.tier IS
  'Protected commercial directory tier; never owner-mutable.';
COMMENT ON COLUMN ghm.business.is_featured IS
  'Protected promotion state; never owner-mutable.';
COMMENT ON COLUMN ghm.business.profile_views IS
  'Protected analytics aggregate; never client supplied.';
COMMENT ON COLUMN ghm.business.logo_url IS
  'Protected public media reference; changed only through separately authorized storage workflow.';
COMMENT ON COLUMN ghm.business.avatar_letter IS
  'Protected generated directory avatar presentation field.';
COMMENT ON COLUMN ghm.business.avatar_color IS
  'Protected generated directory avatar presentation field.';

CREATE INDEX business_directory_province_city_idx
  ON ghm.business (province, city)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';
CREATE INDEX business_directory_supplier_idx
  ON ghm.business (is_supplier, rating DESC)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';

REVOKE UPDATE (
  province, city, physical_address, whatsapp, website, logo_url,
  avatar_letter, avatar_color, is_supplier, tier, is_featured,
  profile_views, years_in_business
) ON TABLE ghm.business FROM ghm_runtime;
