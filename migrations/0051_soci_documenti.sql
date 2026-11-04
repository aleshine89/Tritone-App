create table if not exists soci_documenti (
  id serial primary key,
  submission_id integer not null,
  user_id text not null,
  kind text not null check (kind in ('medico', 'assicurazione')),
  titolo text not null default '',
  scadenza text not null default '',
  file_name text not null,
  file_type text not null,
  file_data text not null,
  creato_il timestamptz not null default now()
);

create unique index if not exists soci_documenti_scheda_kind_idx on soci_documenti (submission_id, kind);
