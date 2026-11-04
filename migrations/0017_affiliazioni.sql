create table if not exists affiliazioni (
  id serial primary key,
  user_id text not null,
  nome text not null,
  cognome text not null,
  telefono text not null,
  email text not null,
  diving_nome text not null,
  sede text not null,
  codice_fiscale text not null,
  diving_email text not null,
  diving_telefono text not null,
  stato text not null default 'in-attesa',
  codice text,
  creato_il timestamptz not null default now()
);

alter table affiliazioni drop constraint if exists affiliazioni_stato_check;
alter table affiliazioni add constraint affiliazioni_stato_check
  check (stato in ('in-attesa', 'codice-inviato', 'accettata'));

create index if not exists affiliazioni_user_idx on affiliazioni (user_id);
create unique index if not exists affiliazioni_codice_uidx on affiliazioni (lower(codice)) where codice is not null and codice <> '';
