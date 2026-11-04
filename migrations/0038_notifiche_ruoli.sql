alter table notifications add column if not exists user_id text;
alter table notifications add column if not exists affiliazione_id integer;

create index if not exists notifications_user_idx on notifications (user_id);
create index if not exists notifications_affiliazione_idx on notifications (affiliazione_id);

create unique index if not exists notifications_affiliazione_ruolo_idx
  on notifications (affiliazione_id, audience, title)
  where affiliazione_id is not null;
