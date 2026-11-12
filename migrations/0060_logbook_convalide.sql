create table if not exists logbook_convalide (
  id serial primary key,
  entry_id integer not null,
  from_user_id text not null,
  to_user_id text not null,
  from_name text not null,
  stato text not null default 'inviata',
  notification_id integer,
  created_at timestamptz not null default now()
);

create index if not exists logbook_convalide_to_idx on logbook_convalide (to_user_id, stato);
create index if not exists logbook_convalide_entry_idx on logbook_convalide (entry_id, stato);
