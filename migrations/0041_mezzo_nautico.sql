alter table club add column if not exists mezzo_nautico boolean not null default true;
alter table club add column if not exists mezzo_richiesto boolean not null default false;
alter table affiliazioni add column if not exists mezzo_nautico boolean;
