create table if not exists titolare_trattamento (
  id integer primary key,
  nome text not null default '',
  sede text not null default '',
  email text not null default '',
  constraint titolare_one check (id = 1)
);

insert into titolare_trattamento (id) values (1) on conflict (id) do nothing;
