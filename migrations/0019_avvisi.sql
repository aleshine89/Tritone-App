alter table submissions add column if not exists letto_il timestamptz;

create table if not exists avvisi_push (
  user_id text not null,
  chiave text not null,
  primary key (user_id, chiave)
);
