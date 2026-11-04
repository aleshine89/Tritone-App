alter table club add column if not exists chiave_pubblica text not null default '';
alter table club add column if not exists accordo_version text not null default '';
alter table club add column if not exists accordo_at timestamptz;
alter table club add column if not exists accetta_moduli boolean not null default true;
