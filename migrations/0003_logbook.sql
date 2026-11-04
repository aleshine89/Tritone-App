create table if not exists logbook_entries (
  id serial primary key,
  user_id text not null,
  dive_date date not null,
  site text not null,
  point text not null default '',
  depth_m text not null default '',
  minutes text not null default '',
  buddy text not null default '',
  mix text not null default '',
  oxygen text not null default '',
  temp_c text not null default '',
  visibility_m text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists logbook_user_idx on logbook_entries (user_id, dive_date desc);
