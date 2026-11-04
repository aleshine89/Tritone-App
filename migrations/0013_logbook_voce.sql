create table if not exists logbook_voice (
  entry_id integer primary key,
  user_id text not null,
  file_type text not null,
  file_data text not null,
  created_at timestamptz not null default now()
);
