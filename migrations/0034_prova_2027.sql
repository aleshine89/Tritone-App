update club
set prova_fino = date '2027-03-31'
where piano = 'trial'
  and prova_fino = date '2026-03-31';

update profiles
set prova_fino = date '2027-03-31'
where ruolo = 'sub'
  and piano = 'trial'
  and prova_fino = date '2026-03-31';
