create table if not exists imbarcazioni (
  id serial primary key,
  club_id integer not null,
  nome text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists imbarcazioni_nome_idx on imbarcazioni (club_id, nome);
create index if not exists imbarcazioni_club_idx on imbarcazioni (club_id, nome);

alter table uscite add column if not exists imbarcazione text not null default '';
alter table uscite add column if not exists imbarcazione_id integer;

create table if not exists uscita_gruppi (
  id serial primary key,
  uscita_id integer not null references uscite (id) on delete cascade,
  guida_user_id text,
  guida_nome text not null default '',
  passaggio boolean not null default false,
  motivo_rapporto text not null default ''
);

create index if not exists uscita_gruppi_idx on uscita_gruppi (uscita_id);

alter table uscita_righe add column if not exists gruppo_id integer;

insert into uscita_gruppi (uscita_id, guida_user_id, guida_nome, passaggio, motivo_rapporto)
select u.id, u.guida_user_id, case when u.guida_nome <> '' then u.guida_nome else 'Solo passaggio' end,
       u.guida_user_id is null, u.motivo_rapporto
from uscite u
where not exists (select 1 from uscita_gruppi g where g.uscita_id = u.id);

update uscita_righe r
set gruppo_id = g.id
from uscita_gruppi g
where r.uscita_id = g.uscita_id and r.gruppo_id is null;
