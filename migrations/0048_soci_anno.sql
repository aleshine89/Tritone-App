drop index if exists soci_attivo_idx;
create unique index if not exists soci_attivo_anno_idx
  on soci (club_id, user_id, anno)
  where stato = 'accettato' and rimosso_il is null;

drop index if exists soci_numero_idx;
create unique index if not exists soci_numero_anno_idx
  on soci (club_id, anno, numero)
  where numero is not null and stato = 'accettato' and rimosso_il is null;
