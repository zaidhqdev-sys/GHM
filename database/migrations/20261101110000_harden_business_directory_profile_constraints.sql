-- Tighten directory profile constraints without rewriting historical migrations.
-- Website values must have a non-empty HTTP(S) authority and no embedded whitespace.
-- Physical addresses, when present, must contain non-whitespace text.
-- Source-only reconciliation: do not execute against production or any live database.

ALTER TABLE ghm.business
  DROP CONSTRAINT business_directory_address_check,
  DROP CONSTRAINT business_directory_website_check,
  ADD CONSTRAINT business_directory_address_check
    CHECK (
      physical_address IS NULL
      OR length(btrim(physical_address)) BETWEEN 1 AND 500
    ),
  ADD CONSTRAINT business_directory_website_check
    CHECK (
      website IS NULL
      OR (
        website = btrim(website)
        AND length(website) BETWEEN 1 AND 2048
        AND website ~* '^https?://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
      )
    );
