alter table logbook_entries add column if not exists dive_time text not null default '';
alter table logbook_entries add column if not exists dive_profile text not null default '';
