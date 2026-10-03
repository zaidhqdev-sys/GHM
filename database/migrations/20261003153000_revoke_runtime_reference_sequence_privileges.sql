begin;

revoke usage, select, update
  on sequence ghm.currency_id_seq, ghm.country_id_seq
  from ghm_runtime;

commit;
