create table if not exists brevetti (
  id serial primary key,
  user_id text not null,
  titolo text not null,
  ente text not null default '',
  livello text not null default '',
  numero text not null default '',
  rilascio date,
  scadenza date,
  note text not null default '',
  file_name text not null default '',
  file_type text not null default '',
  file_data text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brevetti_user_idx on brevetti (user_id, scadenza);

create table if not exists kit_personale (
  id serial primary key,
  user_id text not null,
  nome text not null,
  marca text not null default '',
  matricola text not null default '',
  collaudo date,
  scadenza date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kit_personale_user_idx on kit_personale (user_id, scadenza);
