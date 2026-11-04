create table if not exists guida_accettazioni (
  user_id text primary key,
  accepted_at timestamptz not null default now()
);
