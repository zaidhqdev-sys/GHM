begin;

do $$
begin
  if to_regclass('ghm.currency') is null then raise exception 'canonical GHM table ghm.currency is missing'; end if;
  if to_regclass('ghm.country') is null then raise exception 'canonical GHM table ghm.country is missing'; end if;
end;
$$;

alter table ghm.currency
  add column if not exists minor_unit integer not null default 2,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table ghm.country
  add column if not exists code_alpha3 text,
  add column if not exists default_currency_id bigint,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from ghm.currency where code !~ '^[A-Z]{3}$' or btrim(name) = '' or btrim(coalesce(symbol, '')) = '' or minor_unit not between 0 and 6) then
    raise exception 'existing ghm.currency rows violate the reference-data contract';
  end if;
  if exists (select 1 from ghm.country where code !~ '^[A-Z]{2}$' or btrim(name) = '') then
    raise exception 'existing ghm.country rows violate the reference-data contract';
  end if;
end;
$$;

insert into ghm.currency (code, name, symbol, minor_unit)
values ('ZAR', 'South African Rand', 'R', 2)
on conflict (code) do update
set name = excluded.name, symbol = excluded.symbol, minor_unit = excluded.minor_unit, is_active = true;

insert into ghm.country (code, code_alpha3, name, default_currency_id)
select 'ZA', 'ZAF', 'South Africa', c.id
from ghm.currency c where c.code = 'ZAR'
on conflict (code) do nothing;

update ghm.country set code_alpha3 = 'ZAF'
where code = 'ZA' and code_alpha3 is null;

update ghm.country set default_currency_id = c.id
from ghm.currency c
where ghm.country.code = 'ZA' and c.code = 'ZAR' and ghm.country.default_currency_id is null;

do $$
begin
  if exists (select 1 from ghm.country where code_alpha3 is null or code_alpha3 !~ '^[A-Z]{3}$') then
    raise exception 'existing ghm.country rows could not be reconciled to alpha-3 identity';
  end if;
  if exists (
    select 1 from ghm.country c left join ghm.currency cur on cur.id = c.default_currency_id
    where c.default_currency_id is not null and cur.id is null
  ) then
    raise exception 'ghm.country contains an invalid default_currency_id';
  end if;
end;
$$;

alter table ghm.currency alter column symbol set not null;
alter table ghm.country alter column code_alpha3 set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'country_default_currency_id_fkey' and conrelid = 'ghm.country'::regclass) then
    alter table ghm.country add constraint country_default_currency_id_fkey foreign key (default_currency_id) references ghm.currency(id) on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'currency_code_format' and conrelid = 'ghm.currency'::regclass) then alter table ghm.currency add constraint currency_code_format check (code ~ '^[A-Z]{3}$'); end if;
  if not exists (select 1 from pg_constraint where conname = 'currency_name_not_blank' and conrelid = 'ghm.currency'::regclass) then alter table ghm.currency add constraint currency_name_not_blank check (btrim(name) <> ''); end if;
  if not exists (select 1 from pg_constraint where conname = 'currency_symbol_not_blank' and conrelid = 'ghm.currency'::regclass) then alter table ghm.currency add constraint currency_symbol_not_blank check (btrim(symbol) <> ''); end if;
  if not exists (select 1 from pg_constraint where conname = 'currency_minor_unit_range' and conrelid = 'ghm.currency'::regclass) then alter table ghm.currency add constraint currency_minor_unit_range check (minor_unit between 0 and 6); end if;
  if not exists (select 1 from pg_constraint where conname = 'country_alpha2_code_format' and conrelid = 'ghm.country'::regclass) then alter table ghm.country add constraint country_alpha2_code_format check (code ~ '^[A-Z]{2}$'); end if;
  if not exists (select 1 from pg_constraint where conname = 'country_alpha3_code_format' and conrelid = 'ghm.country'::regclass) then alter table ghm.country add constraint country_alpha3_code_format check (code_alpha3 ~ '^[A-Z]{3}$'); end if;
  if not exists (select 1 from pg_constraint where conname = 'country_name_not_blank' and conrelid = 'ghm.country'::regclass) then alter table ghm.country add constraint country_name_not_blank check (btrim(name) <> ''); end if;
end;
$$;

create index if not exists country_default_currency_id_idx on ghm.country(default_currency_id);

grant usage on schema ghm to ghm_runtime;
grant select on table ghm.currency, ghm.country to ghm_runtime;
revoke insert, update, delete, truncate, references, trigger on table ghm.currency, ghm.country from ghm_runtime;
revoke usage, select, update on sequence ghm.currency_id_seq, ghm.country_id_seq from ghm_runtime;

commit;
