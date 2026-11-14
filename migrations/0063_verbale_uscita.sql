create table if not exists verbali_uscita (
  id integer primary key generated always as identity,
  uscita_id integer not null references uscite (id) on delete cascade,
  club_id integer not null,
  creato_da text not null,
  cosa text not null,
  racconto text not null default '',
  chi text not null default '',
  fatto text not null default '',
  ora text not null default '',
  firma text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists verbali_uscita_unica on verbali_uscita (uscita_id);
