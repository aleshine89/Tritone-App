create table if not exists soci (
  id serial primary key,
  club_id integer not null,
  user_id text not null,
  submission_id integer not null,
  numero integer,
  nota text not null default '',
  anno integer not null,
  stato text not null check (stato in ('accettato', 'rifiutato')),
  accettato_il timestamptz,
  rifiutato_il timestamptz,
  rimosso_il timestamptz
);

create unique index if not exists soci_scheda_idx on soci (submission_id);
create unique index if not exists soci_numero_idx on soci (club_id, numero) where numero is not null;
create unique index if not exists soci_attivo_idx on soci (club_id, user_id) where stato = 'accettato' and rimosso_il is null;
create index if not exists soci_club_anno_idx on soci (club_id, anno);
