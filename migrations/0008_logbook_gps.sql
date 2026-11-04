alter table logbook_entries add column if not exists lat text not null default '';
alter table logbook_entries add column if not exists lng text not null default '';
