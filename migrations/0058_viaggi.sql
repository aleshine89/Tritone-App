create table if not exists viaggi (
  id serial primary key,
  club_id integer not null,
  titolo text not null,
  dal date not null,
  al date not null,
  ospite_club_id integer,
  ospite_nome text not null default '',
  stato text not null default 'bozza',
  creato_da text not null,
  creato_il timestamptz not null default now(),
  inviato_il timestamptz
);

create index if not exists viaggi_club_idx on viaggi (club_id, dal);
create index if not exists viaggi_ospite_idx on viaggi (ospite_club_id, stato);

create table if not exists viaggio_persone (
  id serial primary key,
  viaggio_id integer not null references viaggi (id) on delete cascade,
  user_id text,
  nome text not null default '',
  cognome text not null default '',
  email text not null default '',
  origine text not null default 'socio',
  consenso boolean not null default false
);

create index if not exists viaggio_persone_idx on viaggio_persone (viaggio_id);

create table if not exists viaggio_moduli (
  persona_id integer not null references viaggio_persone (id) on delete cascade,
  form_key text not null,
  payload text not null default '{}',
  origine text not null default 'utente',
  confermato boolean not null default false,
  foto text not null default '',
  primary key (persona_id, form_key)
);

create table if not exists viaggio_gruppi (
  id serial primary key,
  viaggio_id integer not null references viaggi (id) on delete cascade,
  giorno date not null,
  guida_user_id text not null,
  guida_nome text not null default '',
  firma text not null default '',
  firmato_il timestamptz,
  ora_inizio text not null default '',
  ora_fine text not null default '',
  profondita text not null default '',
  profondita_prevista text not null default '',
  autorespiratore text not null default '',
  miscela text not null default '',
  chiuso boolean not null default false
);

create index if not exists viaggio_gruppi_idx on viaggio_gruppi (viaggio_id, giorno);

create table if not exists viaggio_gruppo_persone (
  gruppo_id integer not null references viaggio_gruppi (id) on delete cascade,
  persona_id integer not null references viaggio_persone (id) on delete cascade,
  primary key (gruppo_id, persona_id)
);

alter table uscite add column if not exists viaggio_id integer;
alter table logbook_entries add column if not exists ora_fine text not null default '';
alter table logbook_entries add column if not exists centro text not null default '';
alter table logbook_entries add column if not exists guida_nome text not null default '';
alter table logbook_entries add column if not exists guida_firma text not null default '';
alter table logbook_entries add column if not exists profondita_prevista text not null default '';
alter table logbook_entries add column if not exists viaggio_gruppo_id integer;
