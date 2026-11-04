create table if not exists soci_comunicazioni (
  id serial primary key,
  club_id integer not null,
  anno integer not null,
  titolo text not null,
  testo text not null,
  tutti boolean not null default false,
  creato_il timestamptz not null default now(),
  creato_da text not null
);

create index if not exists soci_comunicazioni_club_idx on soci_comunicazioni (club_id, creato_il desc);

create table if not exists soci_comunicazioni_destinatari (
  comunicazione_id integer not null references soci_comunicazioni (id) on delete cascade,
  user_id text not null,
  primary key (comunicazione_id, user_id)
);

create table if not exists soci_comunicazioni_file (
  id serial primary key,
  comunicazione_id integer not null references soci_comunicazioni (id) on delete cascade,
  file_name text not null,
  file_data text not null
);

alter table notifications add column if not exists soci_comunicazione_id integer;
create index if not exists notifications_comunicazione_idx on notifications (soci_comunicazione_id);
