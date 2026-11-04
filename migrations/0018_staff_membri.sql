create table if not exists staff_membri (
  user_id text not null,
  club_id integer not null,
  primary key (user_id, club_id)
);

insert into staff_membri (user_id, club_id)
select user_id, club_id
from profiles
where role = 'istruttore' and club_id is not null
on conflict do nothing;
