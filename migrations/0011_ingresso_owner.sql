alter table notifications alter column submission_id drop not null;
alter table notifications add column if not exists audience text not null default 'staff';
