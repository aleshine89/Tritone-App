-- Più scuole nella stessa app. Il club 1, se c'è, resta la prima scuola.

alter table club drop constraint if exists club_one;

create sequence if not exists club_id_seq;
select setval(
  'club_id_seq',
  coalesce((select max(id) from club), 1),
  (select max(id) is not null from club)
);
alter table club alter column id set default nextval('club_id_seq');
alter sequence club_id_seq owned by club.id;

alter table club add column if not exists stato text not null default 'attiva';
alter table club add column if not exists creato_il timestamptz not null default now();
alter table club add column if not exists codice_allievi text not null default '';

update club
set codice_allievi = 'allievi-' || id::text
where codice_allievi = '';

alter table club drop constraint if exists club_stato_check;
alter table club add constraint club_stato_check check (stato in ('attiva', 'sospesa'));

create unique index if not exists club_allievi_uidx on club (lower(codice_allievi)) where codice_allievi <> '';
create unique index if not exists club_staff_uidx on club (lower(codice_staff)) where codice_staff <> '';
create unique index if not exists club_owner_uidx on club (lower(codice_proprietario)) where codice_proprietario <> '';

alter table profiles add column if not exists club_id integer;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('subacqueo', 'istruttore', 'scuola', 'piattaforma'));

update profiles
set club_id = 1
where club_id is null
  and role in ('subacqueo', 'istruttore', 'scuola')
  and exists (select 1 from club where id = 1);

alter table submissions add column if not exists club_id integer;
update submissions s
set club_id = coalesce((select p.club_id from profiles p where p.user_id = s.user_id), 1)
where s.club_id is null
  and exists (select 1 from club where id = 1);

alter table notifications add column if not exists club_id integer;
update notifications
set club_id = 1
where club_id is null
  and exists (select 1 from club where id = 1);

create index if not exists submissions_club_idx on submissions (club_id);
create index if not exists profiles_club_idx on profiles (club_id);
create index if not exists notifications_club_idx on notifications (club_id);

create table if not exists platform (
  id integer primary key check (id = 1),
  codice text not null,
  owner_user_id text
);

insert into platform (id, codice)
values (1, 'gestione-smile')
on conflict (id) do nothing;
