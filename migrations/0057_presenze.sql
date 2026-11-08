create table if not exists presenze (
  user_id text primary key,
  visto timestamptz not null default now()
);
