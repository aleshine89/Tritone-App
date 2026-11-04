create table if not exists logbook_photos (
  id serial primary key,
  entry_id integer not null,
  user_id text not null,
  file_name text not null,
  file_type text not null,
  file_data text not null,
  created_at timestamptz not null default now()
);

create index if not exists logbook_photos_entry_idx on logbook_photos (entry_id, id);
