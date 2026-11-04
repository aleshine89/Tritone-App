create table if not exists documenti_personali (
  id serial primary key,
  user_id text not null,
  kind text not null check (kind in ('medico', 'assicurazione')),
  titolo text not null,
  soggetto text not null default '',
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

create index if not exists documenti_personali_user_idx on documenti_personali (user_id, kind, scadenza);
