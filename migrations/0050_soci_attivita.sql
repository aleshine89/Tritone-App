create table if not exists soci_attivita (
  id serial primary key,
  club_id integer not null,
  titolo text not null,
  giorno date not null,
  orario text not null default '',
  descrizione text not null default '',
  immagine text not null default '',
  iscrizione boolean not null default false,
  creato_il timestamptz not null default now()
);

create index if not exists soci_attivita_club_idx on soci_attivita (club_id, giorno);

create table if not exists soci_attivita_iscrizioni (
  attivita_id integer not null references soci_attivita (id) on delete cascade,
  user_id text not null,
  creato_il timestamptz not null default now(),
  primary key (attivita_id, user_id)
);
