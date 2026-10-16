-- Connect public directory parity foundation.
-- These fields are descriptive/discovery inputs; trust, promotion and verification
-- values remain server-governed. No production migration or cutover is authorized.

ALTER TABLE ghm.business
  ADD COLUMN category text,
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
  ADD CONSTRAINT business_directory_category_check
    CHECK (category IS NULL OR (
      length(btrim(category)) BETWEEN 1 AND 100
      AND category = lower(category)
      AND category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )),
  ADD CONSTRAINT business_directory_province_check
    CHECK (province IS NULL OR length(btrim(province)) BETWEEN 1 AND 100),
  ADD CONSTRAINT business_directory_city_check
    CHECK (city IS NULL OR length(btrim(city)) BETWEEN 1 AND 120),
  ADD CONSTRAINT business_directory_address_check
    CHECK (physical_address IS NULL OR length(physical_address) <= 500),
  ADD CONSTRAINT business_directory_whatsapp_check
    CHECK (whatsapp IS NULL OR length(btrim(whatsapp)) BETWEEN 7 AND 32),
  ADD CONSTRAINT business_directory_website_check
    CHECK (website IS NULL OR length(btrim(website)) BETWEEN 1 AND 2048),
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

COMMENT ON COLUMN ghm.business.category IS
  'Connect directory category slug; descriptive discovery data, not an authorization claim.';
COMMENT ON COLUMN ghm.business.province IS
  'Business discovery province; populated only from verified/mapped source data.';
COMMENT ON COLUMN ghm.business.city IS
  'Business discovery city; populated only from verified/mapped source data.';
COMMENT ON COLUMN ghm.business.is_supplier IS
  'Nullable compatibility filter for Connect supplier/contractor discovery. NULL means unresolved; do not infer contractor status.';
COMMENT ON COLUMN ghm.business.tier IS
  'Protected commercial directory tier. Never owner-mutable through public profile APIs.';
COMMENT ON COLUMN ghm.business.is_featured IS
  'Protected promotion state. Never owner-mutable through public profile APIs.';
COMMENT ON COLUMN ghm.business.profile_views IS
  'Protected analytics aggregate; never client supplied.';
COMMENT ON COLUMN ghm.business.logo_url IS
  'Public directory logo reference. Storage access policy remains separately governed.';

CREATE INDEX business_public_directory_rank_idx
  ON ghm.business (is_featured DESC, rating DESC, created_at DESC, id ASC)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';

CREATE INDEX business_directory_province_city_idx
  ON ghm.business (province, city)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';

CREATE INDEX business_directory_category_idx
  ON ghm.business (category, is_featured DESC, rating DESC)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';

CREATE INDEX business_directory_supplier_idx
  ON ghm.business (is_supplier, is_featured DESC, rating DESC)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';

-- Explicitly keep these new columns out of owner profile update grants/functions.
REVOKE UPDATE (
  category, province, city, physical_address, whatsapp, website, logo_url,
  avatar_letter, avatar_color, is_supplier, tier, is_featured, profile_views,
  years_in_business
) ON TABLE ghm.business FROM ghm_runtime;
