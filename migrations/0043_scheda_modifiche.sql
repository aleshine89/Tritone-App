create table if not exists scheda_modifiche (
  id serial primary key,
  submission_id integer not null,
  user_id text not null,
  nome text not null default '',
  modified_at timestamptz not null default now()
);

create index if not exists scheda_modifiche_idx on scheda_modifiche (submission_id, modified_at desc);
