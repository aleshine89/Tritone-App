alter table profiles add column if not exists ruolo text;
alter table profiles add column if not exists piano text;
alter table profiles add column if not exists prova_fino date;

alter table club add column if not exists piano text;
alter table club add column if not exists prova_fino date;

alter table profiles drop constraint if exists profiles_ruolo_check;
alter table profiles add constraint profiles_ruolo_check check (ruolo is null or ruolo in ('sub', 'staff', 'titolare'));
alter table profiles drop constraint if exists profiles_piano_check;
alter table profiles add constraint profiles_piano_check check (piano is null or piano in ('trial', 'free', 'pro'));
alter table club drop constraint if exists club_piano_check;
alter table club add constraint club_piano_check check (piano is null or piano in ('trial', 'active', 'sospeso'));

update profiles p
set ruolo = 'titolare'
where p.ruolo is null
  and exists (
    select 1 from club c
    where c.owner_user_id = p.user_id or c.co_owner_user_id = p.user_id
  );

update club c
set piano = 'trial'
where c.piano is null
  and (c.owner_user_id is not null or c.co_owner_user_id is not null);

update club c
set prova_fino = date '2027-03-31'
where c.prova_fino is null
  and c.piano = 'trial';

update profiles p
set ruolo = 'staff'
where p.ruolo is null
  and exists (select 1 from staff_membri m where m.user_id = p.user_id)
  and not exists (
    select 1 from club c
    where c.owner_user_id = p.user_id or c.co_owner_user_id = p.user_id
  );

update profiles p
set club_id = s.club_id
from (
  select user_id, min(club_id) as club_id
  from staff_membri
  group by user_id
  having count(distinct club_id) = 1
) s
where p.user_id = s.user_id
  and p.ruolo = 'staff'
  and p.club_id is null;

update profiles p
set ruolo = 'sub'
where p.ruolo is null
  and p.role = 'subacqueo'
  and not exists (select 1 from staff_membri m where m.user_id = p.user_id)
  and not exists (
    select 1 from club c
    where c.owner_user_id = p.user_id or c.co_owner_user_id = p.user_id
  );

update profiles p
set piano = 'trial'
where p.ruolo = 'sub'
  and p.piano is null;

update profiles p
set prova_fino = date '2027-03-31'
where p.ruolo = 'sub'
  and p.piano = 'trial'
  and p.prova_fino is null;
