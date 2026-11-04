alter table logbook_entries add column if not exists condivisa_da text not null default '';

create table if not exists logbook_condivisioni (
  id serial primary key,
  entry_id integer,
  from_user_id text not null,
  to_user_id text not null,
  from_name text not null,
  stato text not null default 'inviata',
  payload jsonb not null,
  notification_id integer,
  saved_entry_id integer,
  created_at timestamptz not null default now()
);

create index if not exists logbook_condivisioni_to_idx on logbook_condivisioni (to_user_id, stato);
