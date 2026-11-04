create table if not exists accettazioni_legali (
  id serial primary key,
  user_id text not null,
  email text not null default '',
  tipo text not null,
  accepted_at timestamptz not null default now(),
  ip text not null default '',
  pacchetto text not null,
  versione text not null,
  testo text not null
);

create index if not exists accettazioni_legali_user_idx on accettazioni_legali (user_id, accepted_at desc);
create index if not exists accettazioni_legali_quando_idx on accettazioni_legali (accepted_at desc);
