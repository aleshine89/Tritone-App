alter table soci add column if not exists verifica text;

create unique index if not exists soci_verifica_idx on soci (verifica) where verifica is not null and verifica <> '';
