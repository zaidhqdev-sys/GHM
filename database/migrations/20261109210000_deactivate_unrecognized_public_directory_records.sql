-- Retire two unrecognized qualification/test records from the public directory.
-- Preserve their rows and history; only deactivate the exact reviewed records.
DO $deactivate$
DECLARE
  matched_count integer;
  affected_count integer;
BEGIN
  SELECT count(*)
    INTO matched_count
    FROM ghm.business
   WHERE (id = 248 AND name = 'ghm-trust-score-462a0ec9-3fb4-43b7-ba68-2c2112acb766 public' AND is_active = true)
      OR (id = 774 AND name = 'Commercial Prepare Qualification' AND is_active = true);

  IF matched_count <> 2 THEN
    RAISE EXCEPTION
      'Expected both reviewed public-directory records (248, 774) to exist with their exact names and active status; matched %; no records changed',
      matched_count;
  END IF;

  UPDATE ghm.business
     SET is_active = false,
         updated_at = now()
   WHERE (id = 248 AND name = 'ghm-trust-score-462a0ec9-3fb4-43b7-ba68-2c2112acb766 public' AND is_active = true)
      OR (id = 774 AND name = 'Commercial Prepare Qualification' AND is_active = true);

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 2 THEN
    RAISE EXCEPTION
      'Expected to deactivate exactly two reviewed public-directory records; updated %; migration transaction will roll back',
      affected_count;
  END IF;
END
$deactivate$;
