create table if not exists manuale_download (
  id integer primary key,
  n integer not null default 0
);

insert into manuale_download (id, n) values (1, 0) on conflict (id) do nothing;
