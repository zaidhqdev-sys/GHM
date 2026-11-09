-- Retire two unrecognized qualification/test records from the public directory.
-- Preserve their rows and history; only deactivate the exact reviewed records.
-- A clean-install qualification database has neither production row, so it is a no-op there.
DO $deactivate$
DECLARE
  record_count integer;
  active_count integer;
  affected_count integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE is_active = true)
    INTO record_count, active_count
    FROM ghm.business
   WHERE (id = 248 AND name = 'ghm-trust-score-462a0ec9-3fb4-43b7-ba68-2c2112acb766 public')
      OR (id = 774 AND name = 'Commercial Prepare Qualification');

  IF record_count = 0 THEN
    RAISE NOTICE 'Neither reviewed production directory record exists in this database; no-op';
    RETURN;
  END IF;

  IF record_count <> 2 OR active_count = 1 THEN
    RAISE EXCEPTION
      'Expected both reviewed records (248, 774) together and in the same active state; found %, active %; no records changed',
      record_count, active_count;
  END IF;

  IF active_count = 0 THEN
    RAISE NOTICE 'Both reviewed records are already inactive; no-op';
    RETURN;
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
