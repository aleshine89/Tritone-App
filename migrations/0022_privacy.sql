create table if not exists privacy_accettazioni (
  user_id text primary key,
  version text not null,
  accepted_at timestamptz not null default now()
);

create table if not exists scheda_aperture (
  id serial primary key,
  submission_id integer not null,
  user_id text not null,
  nome text not null default '',
  opened_at timestamptz not null default now()
);

create index if not exists scheda_aperture_idx on scheda_aperture (submission_id, opened_at desc);
