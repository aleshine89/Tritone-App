alter table club add column if not exists codice_proprietario text not null default 'proprietario';
alter table club add column if not exists owner_user_id text;

update club
set codice_staff = 'Asdsmilediving',
    codice_proprietario = 'proprietario'
where id = 1;
