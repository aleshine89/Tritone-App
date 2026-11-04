alter table profiles add column if not exists lingua text not null default 'it';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_lingua_check') then
    alter table profiles add constraint profiles_lingua_check check (lingua in ('it', 'en'));
  end if;
end $$;
