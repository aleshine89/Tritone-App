create table if not exists responsabilita_accettazioni (
  user_id text primary key,
  version text not null,
  accepted_at timestamptz not null default now()
);
