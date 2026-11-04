create table if not exists tool_files (
  id serial primary key,
  user_id text not null,
  titolo text not null,
  file_name text not null,
  file_type text not null,
  file_data text not null,
  created_at timestamptz not null default now()
);

create index if not exists tool_files_user_idx on tool_files (user_id, created_at desc);

create table if not exists checklist_voci (
  id serial primary key,
  user_id text not null,
  label text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_voci_user_idx on checklist_voci (user_id, position);
