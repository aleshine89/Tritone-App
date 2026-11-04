create table if not exists profiles (
  user_id text primary key,
  role text not null check (role in ('socio', 'cliente', 'istruttore')),
  nome text not null,
  cognome text not null,
  telefono text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists club (
  id integer primary key,
  nome text not null,
  codice_fiscale text not null default '',
  sede text not null default '',
  email text not null default '',
  telefono text not null default '',
  codice_staff text not null,
  constraint club_one check (id = 1)
);

create table if not exists submissions (
  id serial primary key,
  user_id text not null,
  author_name text not null,
  form_key text not null,
  subject_name text not null,
  dive_date date,
  status text not null check (status in ('bozza', 'inviato')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_user_idx on submissions (user_id);
create index if not exists submissions_subject_idx on submissions (subject_name);
create index if not exists submissions_dive_idx on submissions (dive_date);
create index if not exists submissions_created_idx on submissions (created_at desc);
create index if not exists submissions_form_idx on submissions (form_key);

create table if not exists notifications (
  id serial primary key,
  submission_id integer not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_idx on notifications (created_at desc);

create table if not exists notification_reads (
  notification_id integer not null references notifications (id) on delete cascade,
  user_id text not null,
  primary key (notification_id, user_id)
);
