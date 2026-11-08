alter table profiles add column if not exists pro_fino date;
alter table club add column if not exists attivo_fino date;
alter table club add column if not exists posti_extra integer not null default 0;
alter table club add column if not exists posti_limite integer;

create table if not exists fatture_anagrafica (
  user_id text primary key references profiles (user_id) on delete cascade,
  dati jsonb not null default '{}'::jsonb
);

create table if not exists pagamenti (
  id integer generated always as identity primary key,
  creato_il timestamptz not null default now(),
  user_id text not null,
  club_id integer,
  tipo text not null,
  metodo text not null,
  importo_cent integer not null,
  stato text not null,
  fattura boolean not null default false,
  fattura_dati jsonb not null default '{}'::jsonb,
  mese text not null,
  stripe_id text not null default ''
);

create index if not exists pagamenti_mese_idx on pagamenti (mese, stato);
