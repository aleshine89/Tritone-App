alter table logbook_entries add column if not exists avg_m text not null default '';
alter table logbook_entries add column if not exists acqua text not null default '';
alter table logbook_entries add column if not exists muta text not null default '';
alter table logbook_entries add column if not exists sottomuta text not null default '';
alter table logbook_entries add column if not exists pesi text not null default '';
