alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'subacqueo' where role in ('socio', 'cliente');
alter table profiles add constraint profiles_role_check check (role in ('subacqueo', 'istruttore'));
