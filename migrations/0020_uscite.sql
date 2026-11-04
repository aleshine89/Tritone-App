create table if not exists uscite (
  id serial primary key,
  club_id integer not null,
  data date not null,
  localita text not null default '',
  punto text not null default '',
  guida_user_id text,
  guida_nome text not null default '',
  orario_inizio text not null default '',
  motivo_rapporto text not null default '',
  chiusa_prima timestamptz,
  chiusa_dopo timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists uscite_club_idx on uscite (club_id, data desc);

create table if not exists uscita_righe (
  id serial primary key,
  uscita_id integer not null references uscite (id) on delete cascade,
  user_id text,
  cognome text not null default '',
  nome text not null default '',
  didattica text not null default '',
  livello text not null default '',
  numero_brevetto text not null default '',
  orario_fine text not null default '',
  profondita text not null default '',
  autorespiratore text not null default '',
  miscela text not null default '',
  percentuale_o2 text not null default ''
);

create index if not exists uscita_righe_idx on uscita_righe (uscita_id);
