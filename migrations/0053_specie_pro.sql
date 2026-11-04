alter table scubadex_viste add column if not exists vista_il date;

create table if not exists scubadex_proprie (
  id text primary key,
  user_id text not null,
  nome text not null,
  foto text not null default '',
  note text not null default '',
  giorno date,
  luogo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists scubadex_proprie_user_idx on scubadex_proprie (user_id, created_at desc);

create table if not exists logbook_specie (
  entry_id integer not null,
  user_id text not null,
  specie_id text not null,
  primary key (entry_id, specie_id)
);

create index if not exists logbook_specie_user_idx on logbook_specie (user_id, entry_id);
