create table if not exists chiusure_scuola (
  id serial primary key,
  club_id integer not null,
  user_id text not null,
  nome text not null default '',
  cognome text not null default '',
  telefono text not null default '',
  email text not null default '',
  scuola text not null default '',
  stato text not null default 'in-attesa',
  creato_il timestamptz not null default now()
);

create unique index if not exists chiusure_aperte_idx on chiusure_scuola (club_id) where stato = 'in-attesa';
