create table if not exists scubadex_viste (
  user_id text not null,
  specie_id text not null,
  primary key (user_id, specie_id)
);

create index if not exists scubadex_viste_user_idx on scubadex_viste (user_id);
