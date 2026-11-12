import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { ensureVapid, pushSchoolPhone, pushUsers } from "@/lib/push.server";
import { formByKey, campiMancanti, haCampiChiusi, CAMPI_CHIUSI, chiaveSanitaria, isStaff, keysForGroup, medicalAlert, subjectOf, tieniDecompressive, type FormDef, type Role } from "@/lib/forms";
import { INFORMATIVA_VERSION } from "@/lib/informativa";
import { RESPONSABILITA_VERSION } from "@/lib/responsabilita";
import { ACCORDO_VERSION } from "@/lib/accordo";
import { LEGALI_PACCHETTO, copreLegali, testoDi, versioneDi, type TipoLegale } from "@/lib/legali";
import { SCARICO_CHECKBOX, SCARICO_PACCHETTO, SCARICO_VERSIONE_LOG } from "@/lib/scarico-pianificatore";
import { calcolaAbbonamento, entroProva, FINE_PROVA, nascitaDiving, nascitaSub, type Abbonamento, type PianoDiving, type PianoSub, type RuoloAbb } from "@/lib/abbonamento";
import { tettoStaff } from "@/lib/prezzi";
import { chiaveQuando, scriviUddf, type PuntoProfilo, type UddfRiga } from "@/lib/uddf";
import { leggiNotaAnagrafica, notaAnagrafica, testoNotaAnagrafica, type NotaAnagrafica } from "@/lib/anagrafica";
import { problemiDocumenti, mesiCompiuti } from "@/lib/format";

export type Profile = {
  userId: string;
  role: Role;
  nome: string;
  cognome: string;
  telefono: string;
  clubId: number | null;
  privacyOk: boolean;
  responsabilitaOk: boolean;
  guidaOk: boolean;
  hasFoto: boolean;
  ruoloAbb: RuoloAbb;
  pianoAbb: PianoSub;
  provaFino: string;
  proFino: string;
  lingua: "it" | "en";
};

export type ClubPublic = {
  id: number | null;
  nome: string;
  codiceFiscale: string;
  sede: string;
  email: string;
  telefono: string;
  codiceStaff: string | null;
  codiceProprietario: string | null;
  codiceAllievi: string | null;
  stato: "attiva" | "sospesa";
  hasLogo: boolean;
  accettaModuli: boolean;
  accordoOk: boolean;
  hasChiave: boolean;
  mezzoNautico: boolean;
  mezzoRichiesto: boolean;
  citta: string;
  provincia: string;
  sito: string;
  piano: "" | "trial" | "active" | "sospeso";
  provaFino: string;
  attivoFino: string;
  postiStaff: number;
  postiTetto: number;
};

export type SessionContext = {
  profile: Profile | null;
  club: ClubPublic;
  clubReady: boolean;
  hasInstructor: boolean;
  owner: boolean;
  platform: boolean;
  sospesa: boolean;
  allievi: number;
  unread: number;
  avviso: string;
  unreadGestore: number;
  avvisoGestore: string;
  unreadSub: number;
  avvisoSub: string;
  oggi: string;
  privacyOk: boolean;
  responsabilitaOk: boolean;
  guidaOk: boolean;
  legaliOk: boolean;
  tipoLegale: TipoLegale;
  wizardOk: boolean;
  abbonamento: Abbonamento;
  lingua: "it" | "en";
};

export type SubmissionDetail = {
  id: number;
  userId: string;
  authorName: string;
  formKey: string;
  subjectName: string;
  diveDate: string | null;
  status: "bozza" | "inviato";
  payload: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  clubId: number | null;
  riservato: boolean;
  aperture: { nome: string; openedAt: string }[];
  modifiche: { nome: string; modifiedAt: string }[];
};

export type SubmissionListItem = {
  id: number;
  userId: string;
  authorName: string;
  formKey: string;
  subjectName: string;
  diveDate: string | null;
  status: "bozza" | "inviato";
  createdAt: string;
  mine: boolean;
  extra: string;
  scadenza: string | null;
  esito: string | null;
  clubNome: string;
  letto?: boolean;
};

export type Notice = {
  id: number;
  submissionId: number;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  kind: "scheda" | "affiliazione" | "esito" | "iscrizione" | "abbandono" | "condivisione" | "convalida";
  nota: NotaAnagrafica | null;
  divingNome: string;
  persona: string;
  shareId?: number;
  shareStato?: string;
  convalidaId?: number;
};

const EMPTY_CLUB: ClubPublic = {
  id: null,
  nome: "",
  codiceFiscale: "",
  sede: "",
  email: "",
  telefono: "",
  codiceStaff: null,
  codiceProprietario: null,
  codiceAllievi: null,
  stato: "attiva",
  hasLogo: false,
  accettaModuli: true,
  accordoOk: false,
  hasChiave: false,
  mezzoNautico: true,
  mezzoRichiesto: false,
  citta: "",
  provincia: "",
  sito: "",
  piano: "",
  provaFino: "",
  attivoFino: "",
  postiStaff: 0,
  postiTetto: 0,
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asPayload(value: unknown): Record<string, string> {
  let source: unknown = value;
  if (typeof value === "string") {
    try {
      source = JSON.parse(value);
    } catch {
      source = {};
    }
  }
  if (!source || typeof source !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(source as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function todayRome(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function countAllievi(sql: Sql, clubId: number): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(distinct s.user_id)::int as n
    from submissions s
    join profiles p on p.user_id = s.user_id
    where s.club_id = ${clubId} and s.status = 'inviato' and p.role = 'subacqueo'
  `;
  return Number(rows[0]?.n ?? 0);
}

type ClubRow = {
  id: number;
  nome: string;
  codice_fiscale: string;
  sede: string;
  email: string;
  telefono: string;
  codice_staff: string;
  codice_proprietario: string;
  codice_allievi: string;
  owner_user_id: string | null;
  co_owner_user_id: string | null;
  stato: string;
  has_logo: boolean | string | null;
  accetta_moduli: boolean | string | null;
  accordo_version: string;
  chiave_pubblica: string;
  piano: string | null;
  prova_fino: string | null;
  mezzo_nautico: boolean | string | null;
  mezzo_richiesto: boolean | string | null;
  citta: string;
  provincia: string;
  sito: string;
  attivo_fino: string | null;
  posti_extra: number | null;
  posti_limite: number | null;
};

const CLUB_FIELDS = `id, nome, codice_fiscale, sede, email, telefono, codice_staff, codice_proprietario, codice_allievi, owner_user_id, co_owner_user_id, stato, (logo_data is not null and logo_data <> '') as has_logo, accetta_moduli, accordo_version, chiave_pubblica, piano, prova_fino::text as prova_fino, mezzo_nautico, mezzo_richiesto, citta, provincia, sito, attivo_fino::text as attivo_fino, posti_extra, posti_limite`;

async function assertPostoStaff(sql: Sql, clubId: number, gia?: string): Promise<void> {
  if (gia) {
    const stesso = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${gia} and ruolo = 'staff' and club_id = ${clubId}`;
    if (stesso[0]) return;
  }
  const club = await loadClubById(sql, clubId);
  if (!club) throw new Error("Scuola non trovata.");
  const conta = await sql<{ n: number }>`select count(*)::int as n from profiles where club_id = ${clubId} and ruolo = 'staff'`;
  const tetto = tettoStaff(club.mezzo_nautico == null ? true : asBool(club.mezzo_nautico), club.posti_limite == null ? null : Number(club.posti_limite), Number(club.posti_extra ?? 0));
  if (Number(conta[0]?.n ?? 0) >= tetto) throw new Error("Posti Pro staff esauriti. Il titolare può aggiungerne uno a 8 €.");
}

async function loadClubById(sql: Sql, clubId: number): Promise<ClubRow | null> {
  const rows = await sql.query<ClubRow>(`select ${CLUB_FIELDS} from club where id = $1`, [clubId]);
  return rows[0] ?? null;
}

function eTitolare(club: { owner_user_id: string | null; co_owner_user_id: string | null }, userId: string): boolean {
  return club.owner_user_id === userId || club.co_owner_user_id === userId;
}

function tipoLegaleDi(profile: Profile, club: ClubRow | null, userId: string): TipoLegale {
  if (profile.role === "scuola" || profile.role === "istruttore") return "diving";
  if (club && eTitolare(club, userId)) return "diving";
  if (profile.role === "piattaforma") return "gestore";
  return "subacqueo";
}

async function legaliAccettati(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ tipo: string }>`
    select tipo from accettazioni_legali
    where user_id = ${userId} and pacchetto = ${LEGALI_PACCHETTO}
  `;
  return rows.map((row) => row.tipo);
}

function deskOf(profile: Profile, club: ClubRow | null): boolean {
  if (!club || profile.clubId !== Number(club.id)) return false;
  if (isStaff(profile.role)) return true;
  return profile.role === "piattaforma" && eTitolare(club, profile.userId);
}

function sameCode(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function canDesk(sql: Sql, profile: Profile, recordClubId: number | null): Promise<boolean> {
  const clubId = profile.clubId;
  if (recordClubId == null || clubId == null || clubId !== Number(recordClubId)) return false;
  if (isStaff(profile.role)) return true;
  if (profile.role !== "piattaforma") return false;
  const club = await loadClubById(sql, clubId);
  return deskOf(profile, club);
}

function toClub(row: ClubRow | null, mode: "owner" | "staff" | "diver" | "none"): ClubPublic {
  if (!row || mode === "none") return EMPTY_CLUB;
  return {
    id: Number(row.id),
    nome: row.nome,
    codiceFiscale: mode === "owner" ? row.codice_fiscale : "",
    sede: row.sede,
    email: row.email,
    telefono: row.telefono,
    codiceStaff: mode === "owner" ? row.codice_staff : null,
    codiceProprietario: mode === "owner" ? row.codice_proprietario : null,
    codiceAllievi: mode === "owner" || mode === "staff" ? row.codice_allievi : null,
    stato: row.stato === "sospesa" ? "sospesa" : "attiva",
    hasLogo: asBool(row.has_logo),
    accettaModuli: row.accetta_moduli == null ? true : asBool(row.accetta_moduli),
    accordoOk: row.accordo_version === ACCORDO_VERSION,
    hasChiave: Boolean(row.chiave_pubblica),
    mezzoNautico: row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico),
    mezzoRichiesto: asBool(row.mezzo_richiesto),
    citta: row.citta ?? "",
    provincia: row.provincia ?? "",
    sito: row.sito ?? "",
    piano: row.piano === "trial" || row.piano === "active" || row.piano === "sospeso" ? row.piano : "",
    provaFino: (row.prova_fino ?? "").slice(0, 10),
    attivoFino: (row.attivo_fino ?? "").slice(0, 10),
    postiStaff: 0,
    postiTetto: tettoStaff(row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico), row.posti_limite == null ? null : Number(row.posti_limite), Number(row.posti_extra ?? 0)),
  };
}

async function loadProfile(sql: Sql, userId: string): Promise<Profile | null> {
  const rows = await sql<{
    user_id: string;
    role: Role;
    nome: string;
    cognome: string;
    telefono: string;
    club_id: number | null;
    privacy_version: string | null;
    responsabilita_version: string | null;
    guida_ok: boolean;
    has_foto: boolean;
    ruolo: string | null;
    piano: string | null;
    prova_fino: string | null;
    pro_fino: string | null;
    lingua: string | null;
  }>`select p.user_id, p.role, p.nome, p.cognome, p.telefono, p.club_id, a.version as privacy_version,
      r.version as responsabilita_version,
      (g.user_id is not null) as guida_ok,
      (p.foto_data is not null and p.foto_data <> '') as has_foto,
      p.ruolo, p.piano, p.prova_fino::text as prova_fino, p.pro_fino::text as pro_fino, p.lingua
      from profiles p
      left join privacy_accettazioni a on a.user_id = p.user_id
      left join responsabilita_accettazioni r on r.user_id = p.user_id
      left join guida_accettazioni g on g.user_id = p.user_id
      where p.user_id = ${userId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    role: row.role,
    nome: row.nome,
    cognome: row.cognome,
    telefono: row.telefono,
    clubId: row.club_id == null ? null : Number(row.club_id),
    privacyOk: row.privacy_version === INFORMATIVA_VERSION,
    responsabilitaOk: row.responsabilita_version === RESPONSABILITA_VERSION,
    guidaOk: asBool(row.guida_ok),
    hasFoto: asBool(row.has_foto),
    ruoloAbb: ruoloAbb(row.ruolo),
    pianoAbb: pianoSub(row.piano),
    provaFino: row.prova_fino ?? "",
    proFino: (row.pro_fino ?? "").slice(0, 10),
    lingua: row.lingua === "en" ? "en" : "it",
  };
}

function ruoloAbb(value: string | null): RuoloAbb {
  return value === "sub" || value === "staff" || value === "titolare" ? value : "";
}

function pianoSub(value: string | null): PianoSub {
  return value === "trial" || value === "free" || value === "pro" ? value : "";
}

function pianoDiving(value: string | null | undefined): PianoDiving {
  return value === "trial" || value === "active" || value === "sospeso" ? value : "";
}

function abbonamentoDi(profile: Profile | null, club: ClubRow | null, oggi: string): Abbonamento {
  const stato = calcolaAbbonamento({
    ruolo: profile?.ruoloAbb ?? "",
    piano: profile?.pianoAbb ?? "",
    provaFino: profile?.provaFino ?? "",
    scuolaPiano: pianoDiving(club?.piano),
    scuolaProvaFino: club?.prova_fino ?? "",
    haScuola: Boolean(club),
    oggi,
    esente: profile?.role === "piattaforma",
  });
  const proScaduto = profile?.pianoAbb === "pro" && Boolean(profile.proFino) && profile.proFino < oggi;
  const scuolaScaduta = Boolean(club?.piano === "active" && club.attivo_fino && club.attivo_fino.slice(0, 10) < oggi);
  if (!proScaduto && !scuolaScaduta) return stato;
  const scuolaAperta = scuolaScaduta ? false : stato.scuolaAperta;
  const proAperto = proScaduto && stato.ruolo === "sub" ? false : scuolaScaduta && stato.ruolo !== "sub" ? false : stato.proAperto;
  return { ...stato, scuolaAperta, proAperto };
}

export async function requirePro(sql: Sql, userId: string) {
  const profile = await loadProfile(sql, userId);
  if (!profile) throw new Error("Completa prima il profilo.");
  const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
  const stato = abbonamentoDi(profile, club, todayRome());
  if (!stato.proAperto) throw new Error("Questa funzione è chiusa.");
}

export async function requireSpeciePro(sql: Sql, userId: string) {
  const profile = await loadProfile(sql, userId);
  if (!profile) throw new Error("Completa prima il profilo.");
  if (profile.ruoloAbb === "staff" || profile.ruoloAbb === "titolare") return;
  const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
  const stato = abbonamentoDi(profile, club, todayRome());
  if (!stato.proAperto) throw new Error("Disponibile con Pro");
}

async function requireScuolaAperta(sql: Sql, profile: Profile) {
  const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
  const stato = abbonamentoDi(profile, club, todayRome());
  if (!stato.scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
}

async function destinatarioAperto(sql: Sql, club: ClubRow, oggi: string): Promise<boolean> {
  if (club.stato !== "attiva") return false;
  if (club.accetta_moduli != null && !asBool(club.accetta_moduli)) return false;
  const ids = [club.owner_user_id, club.co_owner_user_id].filter((id): id is string => Boolean(id));
  if (ids.length) {
    const gestori = await sql.query<{ n: number }>(
      `select count(*)::int as n from profiles where role = 'piattaforma' and user_id = any($1::text[])`,
      [ids],
    );
    if (Number(gestori[0]?.n ?? 0) > 0) return true;
  }
  if (club.piano === "active") return true;
  return oggi <= FINE_PROVA && club.piano === "trial" && entroProva(oggi, club.prova_fino ?? "");
}

type RigaAvviso = {
  id: number;
  user_id: string;
  nome: string;
  cognome: string;
  diving_nome: string;
  anagrafica_nota: string | null;
  stato: string;
};

function testoEsito(stato: string): { title: string; body: string } {
  if (stato === "accettata") return { title: "Diving aperto", body: "Il diving è aperto." };
  if (stato === "codice-inviato") return { title: "Codice pronto", body: "Il gestore ha preparato il codice. Inseriscilo dal Profilo." };
  return { title: "Richiesta in attesa", body: "Richiesta inviata. Il gestore la sta leggendo." };
}

async function inserisciAvvisoPiattaforma(sql: Sql, row: RigaAvviso) {
  if (row.stato === "accettata") return;
  const nota = leggiNotaAnagrafica(row.anagrafica_nota);
  const dettaglio = nota ? testoNotaAnagrafica(nota) : "Anagrafica non indicata.";
  const body = `${row.nome} ${row.cognome} vuole aprire ${row.diving_nome}. ${dettaglio}`;
  try {
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id, user_id, affiliazione_id, created_at)
      select null, ${"Nuova richiesta di affiliazione"}, ${body}, 'piattaforma', null, null, id, creato_il
      from affiliazioni
      where id = ${row.id}
        and stato <> 'accettata'
        and not exists (
          select 1 from notifications n
          where n.affiliazione_id = affiliazioni.id and n.audience = 'piattaforma'
        )
    `;
  } catch {
    /* già presente */
  }
}

async function inserisciAvvisoEsito(sql: Sql, row: RigaAvviso, fresco: boolean) {
  const { title, body } = testoEsito(row.stato);
  try {
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id, user_id, affiliazione_id, created_at)
      select null, ${title}, ${body}, 'sub', null, user_id, id, case when ${fresco} then now() else creato_il end
      from affiliazioni
      where id = ${row.id}
        and user_id = ${row.user_id}
        and not exists (
          select 1 from notifications n
          where n.affiliazione_id = affiliazioni.id and n.audience = 'sub' and n.title = ${title}
        )
    `;
  } catch {
    /* già presente */
  }
}

async function assicuraPiattaforma(sql: Sql) {
  const rows = await sql<RigaAvviso>`
    select id, user_id, nome, cognome, diving_nome, anagrafica_nota, stato
    from affiliazioni
    where stato <> 'accettata'
  `;
  for (const row of rows) await inserisciAvvisoPiattaforma(sql, row);
}

async function assicuraEsiti(sql: Sql, userId: string) {
  const rows = await sql<RigaAvviso>`
    select id, user_id, nome, cognome, diving_nome, anagrafica_nota, stato
    from affiliazioni
    where user_id = ${userId}
  `;
  for (const row of rows) await inserisciAvvisoEsito(sql, row, false);
}

async function unreadFor(sql: Sql, userId: string, clubId: number, owner: boolean): Promise<{ n: number; avviso: string }> {
  const rows = await sql<{ n: number; avviso: string }>`
    select count(*)::int as n,
      coalesce((
        select n2.body
        from notifications n2
        where n2.club_id = ${clubId}
          and (n2.audience = 'staff' or (${owner} and n2.audience = 'owner'))
          and not exists (
            select 1 from notification_reads r
            where r.notification_id = n2.id and r.user_id = ${userId}
          )
        order by n2.created_at desc
        limit 1
      ), '') as avviso
    from notifications n
    where n.club_id = ${clubId}
      and (n.audience = 'staff' or (${owner} and n.audience = 'owner'))
      and not exists (
        select 1 from notification_reads r
        where r.notification_id = n.id and r.user_id = ${userId}
      )
  `;
  return { n: Number(rows[0]?.n ?? 0), avviso: rows[0]?.avviso ?? "" };
}

async function unreadPiattaforma(sql: Sql, userId: string): Promise<{ n: number; avviso: string }> {
  await assicuraPiattaforma(sql);
  const rows = await sql<{ n: number; avviso: string }>`
    select count(*)::int as n,
      coalesce((
        select n2.body
        from notifications n2
        left join affiliazioni a2 on a2.id = n2.affiliazione_id
        where n2.audience = 'piattaforma'
          and (
            (a2.id is not null and a2.stato <> 'accettata')
            or (n2.affiliazione_id is null and n2.title in ('Nuova iscrizione', 'Titolare ha abbandonato', 'Richiesta mezzo nautico'))
          )
          and not exists (
            select 1 from notification_reads r
            where r.notification_id = n2.id and r.user_id = ${userId}
          )
        order by n2.created_at desc
        limit 1
      ), '') as avviso
    from notifications n
    left join affiliazioni a on a.id = n.affiliazione_id
    where n.audience = 'piattaforma'
      and (
        (a.id is not null and a.stato <> 'accettata')
        or (n.affiliazione_id is null and n.title in ('Nuova iscrizione', 'Titolare ha abbandonato', 'Richiesta mezzo nautico'))
      )
      and not exists (
        select 1 from notification_reads r
        where r.notification_id = n.id and r.user_id = ${userId}
      )
  `;
  return { n: Number(rows[0]?.n ?? 0), avviso: rows[0]?.avviso ?? "" };
}

let convalidePronte = false;
let librettoPronto = false;

async function assicuraLibretto(sql: Sql) {
  if (librettoPronto) return;
  await sql`alter table logbook_entries add column if not exists autorespiratore text not null default ''`;
  await sql`alter table logbook_entries add column if not exists brevetto text not null default ''`;
  librettoPronto = true;
}

async function assicuraConvalide(sql: Sql) {
  if (convalidePronte) return;
  await sql`
    create table if not exists logbook_convalide (
      id serial primary key,
      entry_id integer not null,
      from_user_id text not null,
      to_user_id text not null,
      from_name text not null,
      stato text not null default 'inviata',
      notification_id integer,
      created_at timestamptz not null default now()
    )
  `;
  convalidePronte = true;
}

async function contaConvalide(sql: Sql, userId: string): Promise<{ n: number; avviso: string }> {
  await assicuraConvalide(sql);
  const rows = await sql<{ n: number; avviso: string }>`
    select count(*)::int as n,
      coalesce((
        select n2.body
        from notifications n2
        where n2.audience = 'sub' and n2.user_id = ${userId} and n2.title = 'Convalida immersione'
          and not exists (select 1 from notification_reads r where r.notification_id = n2.id and r.user_id = ${userId})
        order by n2.created_at desc
        limit 1
      ), '') as avviso
    from notifications n
    where n.audience = 'sub' and n.user_id = ${userId} and n.title = 'Convalida immersione'
      and not exists (select 1 from notification_reads r where r.notification_id = n.id and r.user_id = ${userId})
  `;
  return { n: Number(rows[0]?.n ?? 0), avviso: rows[0]?.avviso ?? "" };
}

async function unreadEsito(sql: Sql, userId: string): Promise<{ n: number; avviso: string }> {
  await assicuraEsiti(sql, userId);
  const rows = await sql<{ n: number; avviso: string }>`
    select count(*)::int as n,
      coalesce((
        select n2.body
        from notifications n2
        where n2.audience = 'sub'
          and n2.user_id = ${userId}
          and not exists (
            select 1 from notification_reads r
            where r.notification_id = n2.id and r.user_id = ${userId}
          )
        order by n2.created_at desc
        limit 1
      ), '') as avviso
    from notifications n
    where n.audience = 'sub'
      and n.user_id = ${userId}
      and not exists (
        select 1 from notification_reads r
        where r.notification_id = n.id and r.user_id = ${userId}
      )
  `;
  return { n: Number(rows[0]?.n ?? 0), avviso: rows[0]?.avviso ?? "" };
}

async function pack(sql: Sql, userId: string): Promise<SessionContext> {
  const profile = await loadProfile(sql, userId);
  if (profile?.role === "subacqueo" && profile.clubId != null && profile.ruoloAbb !== "staff" && profile.ruoloAbb !== "titolare") {
    await sql`update profiles set club_id = null where user_id = ${userId}`;
    profile.clubId = null;
  }
  const platform = profile?.role === "piattaforma";
  const clubRow = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
  const owns = Boolean(profile && clubRow && deskOf(profile, clubRow) && eTitolare(clubRow, profile.userId));
  const staff = isStaff(profile?.role) || owns;
  const owner = owns;
  const mode = !clubRow || (platform && !owns) ? "none" : owner ? "owner" : staff ? "staff" : "diver";
  const unread = staff && clubRow ? await unreadFor(sql, userId, Number(clubRow.id), owner) : { n: 0, avviso: "" };
  if (staff) {
    const convalide = await contaConvalide(sql, userId);
    unread.n += convalide.n;
    if (convalide.n > 0 && convalide.avviso) unread.avviso = convalide.avviso;
  }
  const gestore = platform ? await unreadPiattaforma(sql, userId) : { n: 0, avviso: "" };
  const esito = await unreadEsito(sql, userId);
  const tipoLegale = profile ? tipoLegaleDi(profile, clubRow, userId) : "subacqueo";
  const accettati = profile ? await legaliAccettati(sql, userId) : [];
  const club = toClub(clubRow, mode);
  if (clubRow) {
    const conta = await sql<{ n: number }>`select count(*)::int as n from profiles where club_id = ${clubRow.id} and ruolo = 'staff'`;
    club.postiStaff = Number(conta[0]?.n ?? 0);
  }
  return {
    profile,
    club,
    clubReady: platform || Boolean(clubRow),
    hasInstructor: staff,
    owner,
    platform,
    sospesa: Boolean(clubRow && clubRow.stato === "sospesa" && !platform),
    allievi: clubRow ? await countAllievi(sql, Number(clubRow.id)) : 0,
    unread: unread.n,
    avviso: unread.avviso,
    unreadGestore: gestore.n,
    avvisoGestore: gestore.avviso,
    unreadSub: esito.n,
    avvisoSub: esito.avviso,
    oggi: todayRome(),
    privacyOk: profile?.privacyOk === true,
    responsabilitaOk: profile?.responsabilitaOk === true,
    guidaOk: profile?.guidaOk === true,
    legaliOk: profile ? copreLegali(accettati, tipoLegale) : false,
    tipoLegale,
    wizardOk: profile?.role === "subacqueo" ? await subHaWizard(sql, userId) : true,
    abbonamento: abbonamentoDi(profile, clubRow, todayRome()),
    lingua: profile?.lingua === "en" ? "en" : "it",
  };
}

function segretoMedico(key: string): boolean {
  return chiaveSanitaria(key);
}

function campoDaChiudere(key: string): boolean {
  return segretoMedico(key) || (CAMPI_CHIUSI as readonly string[]).includes(key);
}

function cleanPayload(form: FormDef, raw: unknown): Record<string, string> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.type === "section" || field.type === "note") continue;
    const value = source[field.key];
    const text = typeof value === "string" ? value.trim() : "";
    if (form.key === "questionario-medico" && segretoMedico(field.key)) continue;
    if (haCampiChiusi(form) && (CAMPI_CHIUSI as readonly string[]).includes(field.key)) continue;
    const max = field.type === "textarea" ? 4000 : field.type === "sign" ? 250000 : field.type === "photo" ? 200000 : field.type === "checks" ? 2000 : 400;
    data[field.key] = field.type === "photo" && !text.startsWith("data:image/") ? "" : text.slice(0, max);
    if (field.type === "photo") {
      const nome = source[`${field.key}_nome`];
      if (typeof nome === "string" && nome.trim()) data[`${field.key}_nome`] = nome.trim().slice(0, 160);
    }
  }
  if (form.key === "registro-immersione" && data.didattica !== "Altro" && data.didattica !== "Altra") data.didattica_specifica = "";
  if (form.key === "registro-immersione" && data.tipo_attivita !== "Tecnica") data.decompressiva = "";
  if (form.key === "registro-immersione" && data.miscela !== "Altra") data.miscela_specifica = "";
  if (form.key === "registro-immersione") tieniDecompressive(source, data);
  if (form.key === "registro-immersione") {
    const scelto = testoCampo(source, "brevetto_id");
    if (/^\d+$/.test(scelto)) data.brevetto_id = scelto;
    const metri = metriIndicati(testoCampo(source, "profondita_massima"));
    if (metri != null) data.profondita_massima = Number.isInteger(metri) ? String(metri) : String(metri);
    const inizio = giornoIso(typeof source.data_inizio === "string" ? source.data_inizio : "");
    const fine = giornoIso(typeof source.data_fine === "string" ? source.data_fine : "");
    if (inizio && fine && fine >= inizio) {
      data.data_inizio = inizio;
      data.data_fine = fine;
      data.data_immersione = inizio;
    }
  }
  if (form.key === "questionario-medico") {
    const cifrato = typeof source.cifrato === "string" ? source.cifrato.trim() : "";
    if (cifrato.startsWith("{")) data.cifrato = cifrato.slice(0, 400000);
    if (source.sintesi === "positiva" || source.sintesi === "nessuna" || source.sintesi === "approvato" || source.sintesi === "non-approvato") {
      data.sintesi = source.sintesi;
    }
  }
  if (haCampiChiusi(form)) {
    const cifrato = typeof source.cifrato === "string" ? source.cifrato.trim() : "";
    if (cifrato.startsWith("{")) data.cifrato = cifrato.slice(0, 400000);
    if (source.documento === "presente") data.documento = "presente";
  }
  return data;
}

function missingFields(form: FormDef, data: Record<string, string>): string[] {
  return campiMancanti(form, data);
}

function referenceDate(form: FormDef, data: Record<string, string>): string | null {
  if (!form.dateKey) return null;
  const value = data[form.dateKey] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function extraOf(formKey: string, data: Record<string, string>): { extra: string; scadenza: string | null; esito: string | null } {
  if (formKey === "registro-immersione") {
    const bits = [data.didattica, data.livello || data.livello_brevetto, data.miscela].filter(Boolean);
    return { extra: bits.join(" · "), scadenza: null, esito: null };
  }
  if (formKey === "registro-attrezzatura") {
    return {
      extra: [data.tipo_intervento, data.esito].filter(Boolean).join(" · "),
      scadenza: /^\d{4}-\d{2}-\d{2}$/.test(data.prossima_scadenza ?? "") ? data.prossima_scadenza : null,
      esito: data.esito || null,
    };
  }
  if (formKey === "questionario-medico") {
    if (data.sintesi === "approvato") return { extra: "Medico: approvato", scadenza: null, esito: "ok" };
    if (data.sintesi === "non-approvato") return { extra: "Medico: non approvato", scadenza: null, esito: "attenzione" };
    const alert = data.sintesi === "positiva" || medicalAlert(data);
    return {
      extra: alert ? "Serve la valutazione del medico" : "Nessuna risposta che richieda il medico",
      scadenza: null,
      esito: alert ? "attenzione" : "ok",
    };
  }
  if (formKey === "scheda-istruttore") {
    const scadenza = /^\d{4}-\d{2}-\d{2}$/.test(data.scadenza_medico ?? "")
      ? data.scadenza_medico
      : /^\d{4}-\d{2}-\d{2}$/.test(data.scadenza_polizza ?? "")
        ? data.scadenza_polizza
        : null;
    return { extra: [data.ruolo, data.didattica].filter(Boolean).join(" · "), scadenza, esito: null };
  }
  if (formKey === "brevetto-esperienza") {
    return { extra: [data.didattica, data.livello].filter(Boolean).join(" · "), scadenza: null, esito: null };
  }
  return { extra: data.tipo_attivita || "", scadenza: null, esito: null };
}

type JoinInput = {
  nome: string;
  cognome: string;
  telefono: string;
  role: Role;
  nomeScuola: string;
  sede: string;
  codice: string;
};

function freshCode(prefix: string): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `${prefix}-${body}`;
}

async function uniqueCode(sql: Sql, prefix: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = freshCode(prefix);
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from club
      where lower(codice_allievi) = lower(${code})
         or lower(codice_staff) = lower(${code})
         or lower(codice_proprietario) = lower(${code})
    `;
    if (Number(rows[0]?.n ?? 0) === 0) return code;
  }
  throw new Error("Non riesco a generare un codice. Riprova.");
}

async function findByAllievi(sql: Sql, code: string): Promise<ClubRow | null> {
  const given = code.trim();
  if (given.length < 4) return null;
  const rows = await sql.query<ClubRow>(
    `select ${CLUB_FIELDS} from club where lower(codice_allievi) = lower($1) limit 1`,
    [given],
  );
  return rows[0] ?? null;
}

async function matchAccessCode(sql: Sql, code: string): Promise<ClubRow> {
  const given = code.trim();
  if (given.length < 4) throw new Error("Inserisci il codice di accesso.");
  const rows = await sql.query<ClubRow>(
    `select ${CLUB_FIELDS} from club
     where lower(codice_staff) = lower($1)
     limit 1`,
    [given],
  );
  const club = rows[0];
  if (!club) throw new Error("Codice staff non corretto. Lo consegna il titolare del diving.");
  if (club.stato === "sospesa") throw new Error("Questa scuola è sospesa.");
  return club;
}

async function openSchool(sql: Sql, userId: string, nomeScuola: string, sede: string): Promise<number> {
  const nome = nomeScuola.trim().slice(0, 120);
  if (nome.length < 2) throw new Error("Indica il nome della scuola, del club o del diving.");
  const allievi = await uniqueCode(sql, "allievi");
  const staff = await uniqueCode(sql, "staff");
  const owner = await uniqueCode(sql, "owner");
  const nato = nascitaDiving(todayRome());
  const rows = await sql<{ id: number }>`
    insert into club (
      nome, codice_fiscale, sede, email, telefono, codice_staff, codice_proprietario, codice_allievi, owner_user_id, stato, piano, prova_fino
    ) values (
      ${nome}, '', ${sede.trim().slice(0, 160)}, '', '', ${staff}, ${owner}, ${allievi}, ${userId}, 'attiva',
      ${nato.piano || null}, ${nato.provaFino || null}
    )
    returning id
  `;
  const id = Number(rows[0]?.id);
  if (!id) throw new Error("Non riesco ad aprire la scuola.");
  return id;
}

async function notifySchool(
  sql: Sql,
  clubId: number,
  title: string,
  body: string,
  exceptUserId: string,
  submissionId: number | null = null,
) {
  const club = await loadClubById(sql, clubId);
  if (club && eTitolare(club, exceptUserId)) return;
  await sql`
    insert into notifications (submission_id, title, body, audience, club_id)
    values (${submissionId}, ${title}, ${body}, 'staff', ${clubId})
  `;
  await pushSchoolPhone(sql, clubId, title, body);
}

async function requireOwner(sql: Sql, userId: string): Promise<ClubRow> {
  const profile = await loadProfile(sql, userId);
  const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
  if (!profile || !club || !eTitolare(club, userId)) {
    throw new Error("Solo il responsabile della scuola può modificare questi dati.");
  }
  if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) {
    throw new Error("Il diving non è in prova valida né attivo.");
  }
  return club;
}

async function requirePlatform(sql: Sql, userId: string): Promise<void> {
  const profile = await loadProfile(sql, userId);
  if (!profile || profile.role !== "piattaforma") throw new Error("Solo il gestore della piattaforma può farlo.");
}

export const segnaPresenza = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      insert into presenze (user_id, visto) values (${context.userId}, now())
      on conflict (user_id) do update set visto = now()
    `;
    return { ok: true };
  });

export const contaCollegati = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<number> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from presenze where visto > now() - interval '90 seconds'
    `;
    return Number(rows[0]?.n ?? 0);
  });

function readJoin(input: unknown): JoinInput {
  if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
  const raw = input as Record<string, unknown>;
  const nome = asText(raw.nome).trim().slice(0, 80);
  const cognome = asText(raw.cognome).trim().slice(0, 80);
  const telefono = asText(raw.telefono).trim().slice(0, 40);
  const role = asText(raw.role) as Role;
  if (!nome || !cognome) throw new Error("Nome e cognome sono obbligatori.");
  if (role === "scuola") throw new Error("Il diving si chiede dal profilo del subacqueo, non in registrazione.");
  if (role !== "subacqueo" && role !== "istruttore" && role !== "piattaforma") {
    throw new Error("Scegli la versione scuola o la versione subacqueo.");
  }
  return {
    nome,
    cognome,
    telefono,
    role,
    nomeScuola: asText(raw.nomeScuola).trim().slice(0, 120),
    sede: asText(raw.sede).trim().slice(0, 160),
    codice: asText(raw.codice || raw.codiceStaff).trim().slice(0, 40),
  };
}

async function requireStaff(sql: Sql, userId: string): Promise<Profile> {
  const profile = await loadProfile(sql, userId);
  if (!profile) throw new Error("Completa prima il profilo.");
  if (!profile.clubId) throw new Error("Questa utenza non è collegata a una scuola.");
  const club = await loadClubById(sql, profile.clubId);
  if (!deskOf(profile, club)) throw new Error("Solo la scuola può farlo.");
  if (club?.stato === "sospesa") throw new Error("Questa scuola è sospesa.");
  if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) {
    throw new Error("Il diving non è in prova valida né attivo.");
  }
  return profile;
}

async function assertCodesFree(
  sql: Sql,
  clubId: number,
  codes: { allievi: string; staff: string; owner: string },
): Promise<void> {
  const folded = [codes.allievi, codes.staff, codes.owner].map((item) => item.toLowerCase());
  if (new Set(folded).size < 3) throw new Error("I tre codici devono essere diversi.");
  const rows = await sql<{ id: number }>`
    select id from club
    where id <> ${clubId}
      and (
        lower(codice_allievi) in (${folded[0]}, ${folded[1]}, ${folded[2]})
        or lower(codice_staff) in (${folded[0]}, ${folded[1]}, ${folded[2]})
        or lower(codice_proprietario) in (${folded[0]}, ${folded[1]}, ${folded[2]})
      )
    limit 1
  `;
  if (rows[0]) throw new Error("Uno di questi codici è già usato da un'altra scuola.");
}

export const publicPushKey = createServerFn({ method: "GET" }).handler(async (): Promise<{ publicKey: string }> => {
  const sql = await getSql();
  const keys = await ensureVapid(sql);
  return { publicKey: keys.publicKey };
});

export const savePushDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const endpoint = asText(raw.endpoint).trim();
    const p256dh = asText(raw.p256dh).trim();
    const auth = asText(raw.auth).trim();
    if (!endpoint.startsWith("https://") || !p256dh || !auth) throw new Error("Iscrizione non valida.");
    return { endpoint: endpoint.slice(0, 2000), p256dh: p256dh.slice(0, 400), auth: auth.slice(0, 400) };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      insert into push_devices (user_id, endpoint, p256dh, auth)
      values (${context.userId}, ${data.endpoint}, ${data.p256dh}, ${data.auth})
      on conflict (endpoint) do update
      set user_id = ${context.userId}, p256dh = ${data.p256dh}, auth = ${data.auth}
    `;
    return { ok: true };
  });

export const deletePushDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const endpoint = asText((input as Record<string, unknown>).endpoint).trim();
    if (!endpoint.startsWith("https://")) throw new Error("Iscrizione non valida.");
    return { endpoint: endpoint.slice(0, 2000) };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`delete from push_devices where endpoint = ${data.endpoint} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const getSessionContext = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    return pack(sql, context.userId);
  });

export const createProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readJoin(input))
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const existing = await loadProfile(sql, context.userId);
    if (existing) throw new Error("Il profilo esiste già.");
    if (data.role === "scuola") throw new Error("Il diving si chiede dal profilo del subacqueo, non in registrazione.");
    let clubId: number | null = null;
    if (data.role === "subacqueo") {
      clubId = null;
    } else if (data.role === "istruttore") {
      const club = await matchAccessCode(sql, data.codice);
      await assertPostoStaff(sql, Number(club.id));
      clubId = Number(club.id);
    } else {
      const rows = await sql<{ codice: string; owner_user_id: string | null }>`
        select codice, owner_user_id from platform where id = 1
      `;
      const gate = rows[0];
      if (!gate || !sameCode(gate.codice, data.codice)) throw new Error("Codice gestore non corretto.");
      if (gate.owner_user_id && gate.owner_user_id !== context.userId) {
        throw new Error("Il gestore della piattaforma è già stato indicato.");
      }
      await sql`update platform set owner_user_id = ${context.userId} where id = 1`;
    }
    const oggi = todayRome();
    const sub = nascitaSub(oggi);
    const nato =
      data.role === "subacqueo"
        ? { ruolo: "sub", piano: sub.piano, provaFino: sub.provaFino }
        : data.role === "istruttore"
          ? { ruolo: "staff", piano: "", provaFino: "" }
          : { ruolo: "", piano: "", provaFino: "" };
    await sql`
      insert into profiles (user_id, role, nome, cognome, telefono, club_id, ruolo, piano, prova_fino)
      values (
        ${context.userId}, ${data.role}, ${data.nome}, ${data.cognome}, ${data.telefono}, ${clubId},
        ${nato.ruolo || null}, ${nato.piano || null}, ${nato.provaFino || null}
      )
    `;
    if (data.role !== "piattaforma") {
      const etichetta = data.role === "istruttore" ? "Staff" : "Subacqueo";
      const corpo = `${data.nome} ${data.cognome} · ${etichetta}`;
      try {
        await sql`
          insert into notifications (submission_id, title, body, audience, club_id, user_id, affiliazione_id)
          select null, ${"Nuova iscrizione"}, ${corpo}, 'piattaforma', null, ${context.userId}, null
          where not exists (
            select 1 from notifications n
            where n.audience = 'piattaforma'
              and n.user_id = ${context.userId}
              and n.title = ${"Nuova iscrizione"}
          )
        `;
      } catch {
        /* già presente */
      }
      const gestori = await sql<{ user_id: string }>`
        select user_id from profiles where role = 'piattaforma' and user_id <> ${context.userId}
      `;
      await pushUsers(sql, gestori.map((row) => row.user_id), "Nuova iscrizione", corpo, "/notifiche");
    }
    if (clubId && data.role === "istruttore") {
      await sql`
        insert into staff_membri (user_id, club_id)
        values (${context.userId}, ${clubId})
        on conflict do nothing
      `;
      const telefono = data.telefono.trim() || "non indicato";
      const titolo = "Nuovo staff";
      const corpo = `${data.nome} ${data.cognome} è entrato nello staff. Telefono: ${telefono}.`;
      await notifySchool(sql, clubId, titolo, corpo, context.userId);
    }
    return pack(sql, context.userId);
  });

export const impostaLingua = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const lingua = (input as { lingua?: unknown } | null)?.lingua;
    if (lingua !== "it" && lingua !== "en") throw new Error("Lingua non valida.");
    return { lingua };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await sql`update profiles set lingua = ${data.lingua} where user_id = ${context.userId}`;
    return pack(sql, context.userId);
  });

export const contiIscritti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ subacquei: number; staff: number; titolari: number }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ role: string; n: number }>`
      select role, count(*)::int as n from profiles group by role
    `;
    const n = (role: string) => Number(rows.find((row) => row.role === role)?.n ?? 0);
    return { subacquei: n("subacqueo"), staff: n("istruttore"), titolari: n("scuola") };
  });

export const elencoIscritti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const ruolo = asText((input as { ruolo?: unknown } | null)?.ruolo);
    if (ruolo !== "subacqueo" && ruolo !== "istruttore" && ruolo !== "scuola") throw new Error("Elenco non valido.");
    return { ruolo };
  })
  .handler(async ({ context, data }): Promise<{ nome: string; cognome: string }[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ nome: string; cognome: string }>`
      select nome, cognome from profiles
      where role = ${data.ruolo}
      order by cognome, nome
    `;
    return rows.map((row) => ({ nome: row.nome, cognome: row.cognome }));
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const nome = asText(raw.nome).trim().slice(0, 80);
    const cognome = asText(raw.cognome).trim().slice(0, 80);
    const telefono = asText(raw.telefono).trim().slice(0, 40);
    if (!nome || !cognome) throw new Error("Nome e cognome sono obbligatori.");
    return { nome, cognome, telefono };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await sql`
      update profiles
      set nome = ${data.nome}, cognome = ${data.cognome}, telefono = ${data.telefono}
      where user_id = ${context.userId}
    `;
    return pack(sql, context.userId);
  });

export const getAnagrafica = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string> => {
    const sql = await getSql();
    const rows = await sql<{ anagrafica: string | null }>`
      select anagrafica from profiles where user_id = ${context.userId} limit 1
    `;
    const value = rows[0]?.anagrafica ?? "";
    return value.startsWith("{") ? value : "";
  });

async function subHaWizard(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ fatto: boolean | string | null; brevetto: boolean | string | null; medico: boolean | string | null; polizza: boolean | string | null }>`
    select
      (p.wizard_completo is not null) as fatto,
      exists(select 1 from brevetti b where b.user_id = p.user_id) as brevetto,
      exists(select 1 from documenti_personali d where d.user_id = p.user_id and d.kind = 'medico') as medico,
      exists(select 1 from documenti_personali d where d.user_id = p.user_id and d.kind = 'assicurazione') as polizza
    from profiles p
    where p.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return false;
  if (asBool(row.fatto)) return true;
  return asBool(row.brevetto) && asBool(row.medico) && asBool(row.polizza);
}

export const completaWizard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || profile.role !== "subacqueo") throw new Error("Il wizard è solo per il subacqueo.");
    await sql`update profiles set wizard_completo = coalesce(wizard_completo, now()) where user_id = ${context.userId}`;
    return pack(sql, context.userId);
  });

export const salvaAnagrafica = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const busta = asText((input as { busta?: unknown } | null)?.busta).trim();
    if (!busta.startsWith("{") || busta.length > 20000) throw new Error("Anagrafica non valida.");
    return { busta };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`update profiles set anagrafica = ${data.busta} where user_id = ${context.userId}`;
    return { ok: true };
  });

export const getFotoProfilo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string | null> => {
    const sql = await getSql();
    const rows = await sql<{ foto_data: string | null }>`
      select foto_data from profiles where user_id = ${context.userId} limit 1
    `;
    const dataUrl = rows[0]?.foto_data ?? "";
    return dataUrl.startsWith("data:image/") ? dataUrl : null;
  });

export const setFotoProfilo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const foto = asText((input as { foto?: unknown }).foto).trim();
    if (foto && (!foto.startsWith("data:image/jpeg;base64,") || foto.length > 160_000)) {
      throw new Error("La foto è troppo grande. Riprova con un'immagine più piccola.");
    }
    return { foto };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await sql`update profiles set foto_data = ${data.foto || null} where user_id = ${context.userId}`;
    return { ok: true };
  });

export const getTitolare = createServerFn({ method: "GET" }).handler(async (): Promise<{ nome: string; sede: string; email: string }> => {
  const sql = await getSql();
  await sql`insert into titolare_trattamento (id) values (1) on conflict (id) do nothing`;
  const rows = await sql<{ nome: string; sede: string; email: string }>`
    select nome, sede, email from titolare_trattamento where id = 1
  `;
  const row = rows[0];
  return { nome: row?.nome ?? "", sede: row?.sede ?? "", email: row?.email ?? "" };
});

export const salvaTitolare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const nome = asText(raw.nome).trim().slice(0, 160);
    const sede = asText(raw.sede).trim().slice(0, 200);
    const email = asText(raw.email).trim().slice(0, 120);
    if (!nome || !sede) throw new Error("Scrivi nome e sede del titolare.");
    return { nome, sede, email };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || profile.role !== "piattaforma") throw new Error("Solo il gestore scrive chi è il titolare del trattamento.");
    await sql`
      insert into titolare_trattamento (id, nome, sede, email)
      values (1, ${data.nome}, ${data.sede}, ${data.email})
      on conflict (id) do update set nome = ${data.nome}, sede = ${data.sede}, email = ${data.email}
    `;
    return { ok: true };
  });

export const accettaLegali = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if ((input as { accetto?: unknown } | null)?.accetto !== true) throw new Error("Spunta la dichiarazione per continuare.");
    return { accetto: true as const };
  })
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    const tipo = tipoLegaleDi(profile, club, context.userId);
    const emailRows = await sql<{ email: string }>`select email from "user" where id = ${context.userId}`;
    const email = (emailRows[0]?.email ?? "").trim().slice(0, 160);
    const { ipRichiesta } = await import("@/lib/legali.server");
    await sql`
      insert into accettazioni_legali (user_id, email, tipo, ip, pacchetto, versione, testo)
      values (${context.userId}, ${email}, ${tipo}, ${ipRichiesta()}, ${LEGALI_PACCHETTO}, ${versioneDi(tipo)}, ${testoDi(tipo)})
    `;
    return pack(sql, context.userId);
  });

export type AccettazioneLegale = {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  tipo: TipoLegale | "pianificatore";
  quando: string;
  giorno: string;
  ip: string;
  versione: string;
  testo: string;
};

export const listaAccettazioniLegali = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AccettazioneLegale[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{
      id: number;
      nome: string | null;
      cognome: string | null;
      email: string;
      tipo: string;
      quando: string;
      giorno: string;
      ip: string;
      versione: string;
      testo: string;
    }>`
      select a.id, p.nome, p.cognome, a.email, a.tipo,
             to_char(a.accepted_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI:SS') as quando,
             to_char(a.accepted_at at time zone 'Europe/Rome', 'YYYY-MM-DD') as giorno,
             a.ip, a.versione, a.testo
      from accettazioni_legali a
      left join profiles p on p.user_id = a.user_id
      order by a.accepted_at desc, a.id desc
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome ?? "",
      cognome: row.cognome ?? "",
      email: row.email,
      tipo: row.tipo === "diving" || row.tipo === "gestore" || row.tipo === "pianificatore" ? row.tipo : "subacqueo",
      quando: row.quando,
      giorno: row.giorno,
      ip: row.ip,
      versione: row.versione,
      testo: row.testo,
    }));
  });

export const statoScaricoPianificatore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      select id from accettazioni_legali
      where user_id = ${context.userId} and pacchetto = ${SCARICO_PACCHETTO}
      limit 1
    `;
    return { ok: rows.length > 0 };
  });

export const accettaScaricoPianificatore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if ((input as { accetto?: unknown } | null)?.accetto !== true) throw new Error("Spunta la dichiarazione per continuare.");
    return { accetto: true as const };
  })
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const gia = await sql<{ id: number }>`
      select id from accettazioni_legali
      where user_id = ${context.userId} and pacchetto = ${SCARICO_PACCHETTO}
      limit 1
    `;
    if (gia.length > 0) return { ok: true };
    const emailRows = await sql<{ email: string }>`select email from "user" where id = ${context.userId}`;
    const email = (emailRows[0]?.email ?? "").trim().slice(0, 160);
    const { ipRichiesta } = await import("@/lib/legali.server");
    await sql`
      insert into accettazioni_legali (user_id, email, tipo, ip, pacchetto, versione, testo)
      values (${context.userId}, ${email}, ${"pianificatore"}, ${ipRichiesta()}, ${SCARICO_PACCHETTO}, ${SCARICO_VERSIONE_LOG}, ${SCARICO_CHECKBOX})
    `;
    return { ok: true };
  });

export const accettaInformativa = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    await sql`
      insert into privacy_accettazioni (user_id, version)
      values (${context.userId}, ${INFORMATIVA_VERSION})
      on conflict (user_id) do update set version = ${INFORMATIVA_VERSION}, accepted_at = now()
    `;
    return pack(sql, context.userId);
  });

export const accettaResponsabilita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    await sql`
      insert into responsabilita_accettazioni (user_id, version)
      values (${context.userId}, ${RESPONSABILITA_VERSION})
      on conflict (user_id) do update set version = ${RESPONSABILITA_VERSION}, accepted_at = now()
    `;
    return pack(sql, context.userId);
  });

export const accettaGuida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    await sql`
      insert into guida_accettazioni (user_id)
      values (${context.userId})
      on conflict (user_id) do nothing
    `;
    return pack(sql, context.userId);
  });

export const scaricaMieiDati = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const schede = (await sql<{ form_key: string; subject_name: string; status: string; dive_date: string | null; payload: unknown; created_at: string }>`
      select form_key, subject_name, status, dive_date::text as dive_date, payload, created_at::text as created_at
      from submissions where user_id = ${context.userId} order by id
    `).map((row) => ({
      modulo: row.form_key,
      oggetto: row.subject_name,
      stato: row.status,
      data: row.dive_date ?? "",
      creato: row.created_at,
      dati: typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload ?? {}),
    }));
    const brevetti = (await sql<{ titolo: string; ente: string; livello: string; numero: string; rilascio: string | null; scadenza: string | null; note: string; file_name: string }>`
      select titolo, ente, livello, numero, rilascio::text as rilascio, scadenza::text as scadenza, note, file_name
      from brevetti where user_id = ${context.userId} order by id
    `).map((row) => ({
      titolo: row.titolo,
      ente: row.ente,
      livello: row.livello,
      numero: row.numero,
      rilascio: row.rilascio ?? "",
      scadenza: row.scadenza ?? "",
      note: row.note,
      file: row.file_name,
    }));
    const documenti = (await sql<{ kind: string; titolo: string; soggetto: string; numero: string; rilascio: string | null; scadenza: string | null; note: string; file_name: string }>`
      select kind, titolo, soggetto, numero, rilascio::text as rilascio, scadenza::text as scadenza, note, file_name
      from documenti_personali where user_id = ${context.userId} order by id
    `).map((row) => ({
      tipo: row.kind,
      titolo: row.titolo,
      soggetto: row.soggetto,
      numero: row.numero,
      rilascio: row.rilascio ?? "",
      scadenza: row.scadenza ?? "",
      note: row.note,
      file: row.file_name,
    }));
    const logbook = (await sql<{ data: string; localita: string; punto: string; profondita: string; minuti: string; note: string }>`
      select dive_date::text as data, site as localita, point as punto, depth_m as profondita, minutes as minuti, notes as note
      from logbook_entries where user_id = ${context.userId} order by id
    `).map((row) => ({
      data: row.data,
      localita: row.localita,
      punto: row.punto,
      profondita: row.profondita,
      minuti: row.minuti,
      note: row.note,
    }));
    return {
      informativa: INFORMATIVA_VERSION,
      profilo: { nome: profile.nome, cognome: profile.cognome, telefono: profile.telefono, ruolo: profile.role },
      schede,
      brevetti,
      documenti,
      logbook,
      nota: "Foto e file restano nell'app finché l'account è aperto. Qui ci sono i testi e i nomi dei file.",
    };
  });

export const eliminaAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; richiesta: boolean }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (profile.role === "piattaforma") throw new Error("Il gestore non può chiudere l'account da qui.");
    const owned = await sql<{ id: number; nome: string; owner_user_id: string | null; co_owner_user_id: string | null }>`
      select id, nome, owner_user_id, co_owner_user_id
      from club
      where owner_user_id = ${context.userId} or co_owner_user_id = ${context.userId}
      limit 1
    `;
    const club = owned[0];
    if (club) {
      const staff = await sql<{ n: number }>`
        select count(*)::int as n from staff_membri
        where club_id = ${club.id}
          and user_id is distinct from ${club.owner_user_id}
          and user_id is distinct from ${club.co_owner_user_id}
      `;
      if (Number(staff[0]?.n ?? 0) > 0) {
        throw new Error("Hai dello staff. Togli prima le guide, poi puoi chiedere la chiusura.");
      }
      const aperte = await sql<{ id: number }>`
        select id from chiusure_scuola where club_id = ${club.id} and stato = 'in-attesa' limit 1
      `;
      if (!aperte[0]) {
        const mail = await sql<{ email: string }>`select email from "user" where id = ${context.userId} limit 1`;
        await sql`
          insert into chiusure_scuola (club_id, user_id, nome, cognome, telefono, email, scuola)
          values (
            ${club.id}, ${context.userId}, ${profile.nome}, ${profile.cognome}, ${profile.telefono},
            ${mail[0]?.email ?? ""}, ${club.nome}
          )
        `;
        const gestori = await sql<{ user_id: string }>`select user_id from profiles where role = 'piattaforma'`;
        await pushUsers(
          sql,
          gestori.map((row) => row.user_id),
          "Richiesta di chiusura",
          `${profile.nome} ${profile.cognome} vuole chiudere ${club.nome}. Non ha staff.`,
          "/",
        );
      }
      return { ok: true, richiesta: true };
    }
    await cancellaUtente(sql, context.userId);
    return { ok: true, richiesta: false };
  });

async function cancellaUtente(sql: Sql, id: string) {
  await sql`delete from submissions where user_id = ${id} and status = 'bozza'`;
  await sql`update submissions set user_id = 'account-chiuso' where user_id = ${id}`;
  await sql`delete from brevetti where user_id = ${id}`;
  await sql`delete from documenti_personali where user_id = ${id}`;
  await sql`delete from kit_personale where user_id = ${id}`;
  await sql`delete from tool_files where user_id = ${id}`;
  await sql`delete from checklist_voci where user_id = ${id}`;
  await sql`delete from logbook_photos where user_id = ${id}`;
  await sql`delete from logbook_voice where user_id = ${id}`;
  await sql`delete from logbook_entries where user_id = ${id}`;
  await sql`delete from push_devices where user_id = ${id}`;
  await sql`delete from avvisi_push where user_id = ${id}`;
  await sql`delete from staff_membri where user_id = ${id}`;
  await sql`delete from affiliazioni where user_id = ${id}`;
  await sql`delete from notification_reads where user_id = ${id}`;
  await sql`delete from privacy_accettazioni where user_id = ${id}`;
  await sql`delete from chiusure_scuola where user_id = ${id}`;
  await sql`delete from profiles where user_id = ${id}`;
  await sql`delete from "user" where id = ${id}`;
}

export const becomeInstructor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const codice = asText(raw.codiceStaff || raw.codice).trim().slice(0, 40);
    if (codice.length < 4) throw new Error("Inserisci il codice di accesso.");
    return { codice };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (profile.role === "piattaforma") throw new Error("Apri il tuo diving da Gestione, senza cambiare ruolo.");
    const club = await matchAccessCode(sql, data.codice);
    const clubId = Number(club.id);
    const already = await sql<{ n: number }>`
      select count(*)::int as n from staff_membri where user_id = ${context.userId} and club_id = ${clubId}
    `;
    const fresh = Number(already[0]?.n ?? 0) === 0;
    await sql`
      insert into staff_membri (user_id, club_id)
      values (${context.userId}, ${clubId})
      on conflict do nothing
    `;
    if (profile.role === "subacqueo" || profile.role === "istruttore") {
      await sql`
        update profiles
        set role = 'istruttore', club_id = ${clubId},
            ruolo = case when ruolo = 'titolare' then ruolo else 'staff' end,
            piano = case when ruolo = 'titolare' then piano else null end,
            prova_fino = case when ruolo = 'titolare' then prova_fino else null end
        where user_id = ${context.userId}
      `;
    } else if (!profile.clubId) {
      await sql`
        update profiles
        set club_id = ${clubId},
            ruolo = case when ruolo = 'titolare' then ruolo else coalesce(ruolo, 'staff') end
        where user_id = ${context.userId}
      `;
    }
    if (fresh) {
      const telefono = profile.telefono.trim() || "non indicato";
      await notifySchool(
        sql,
        clubId,
        "Nuovo staff",
        `${profile.nome} ${profile.cognome} è entrato nello staff. Telefono: ${telefono}.`,
        context.userId,
      );
    }
    return pack(sql, context.userId);
  });

export type StaffMio = { id: number; nome: string; sede: string; attivo: boolean };

export const mieiStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<StaffMio[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return [];
    const rows = await sql<{ id: number; nome: string; sede: string }>`
      select c.id, c.nome, c.sede
      from staff_membri m
      join club c on c.id = m.club_id
      where m.user_id = ${context.userId}
      order by c.nome, c.id
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      sede: row.sede,
      attivo: profile.clubId === Number(row.id),
    }));
  });

export const attivaStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Diving non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (profile.role === "scuola" || profile.role === "piattaforma") {
      throw new Error("Questo account resta titolare. Il codice staff è per il subacqueo.");
    }
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from staff_membri where user_id = ${context.userId} and club_id = ${data.id}
    `;
    if (Number(rows[0]?.n ?? 0) === 0) throw new Error("Non sei nello staff di questo diving.");
    const club = await loadClubById(sql, data.id);
    if (!club || club.stato === "sospesa") throw new Error("Questo diving non è disponibile.");
    await sql`update profiles set role = 'istruttore', club_id = ${data.id} where user_id = ${context.userId}`;
    return pack(sql, context.userId);
  });

export const esciDalloStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (profile.role !== "istruttore" || profile.ruoloAbb !== "staff" || !profile.clubId) {
      throw new Error("Solo lo staff può uscire da un diving.");
    }
    const club = await loadClubById(sql, profile.clubId);
    if (club && (club.owner_user_id === context.userId || club.co_owner_user_id === context.userId)) {
      throw new Error("Il titolare non esce da qui.");
    }
    const clubId = profile.clubId;
    await sql`delete from staff_membri where user_id = ${context.userId} and club_id = ${clubId}`;
    const sub = nascitaSub(todayRome());
    await sql`
      update profiles
      set role = 'subacqueo', ruolo = 'sub', club_id = null, piano = ${sub.piano}, prova_fino = ${sub.provaFino || null}
      where user_id = ${context.userId}
    `;
    return pack(sql, context.userId);
  });

export const esciDalTitolare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo un titolare può uscire da qui.");
    const altro = Boolean(club.owner_user_id && club.co_owner_user_id && club.owner_user_id !== club.co_owner_user_id);
    if (!altro) {
      const staff = await sql<{ n: number }>`
        select count(*)::int as n from staff_membri
        where club_id = ${club.id}
          and user_id is distinct from ${club.owner_user_id}
          and user_id is distinct from ${club.co_owner_user_id}
      `;
      if (Number(staff[0]?.n ?? 0) > 0) throw new Error("Devi prima aggiungere un altro titolare.");
      await sql`
        update club
        set owner_user_id = null, co_owner_user_id = null
        where id = ${club.id}
      `;
      const mail = await sql<{ email: string }>`select email from "user" where id = ${context.userId} limit 1`;
      await sql`
        insert into chiusure_scuola (club_id, user_id, nome, cognome, telefono, email, scuola)
        select ${club.id}, ${context.userId}, ${profile.nome}, ${profile.cognome}, ${profile.telefono}, ${mail[0]?.email ?? ""}, ${club.nome}
        where not exists (
          select 1 from chiusure_scuola where club_id = ${club.id} and stato = 'in-attesa'
        )
      `;
    } else if (context.userId === club.owner_user_id) {
      await sql`
        update club
        set owner_user_id = ${club.co_owner_user_id}, co_owner_user_id = null
        where id = ${club.id} and owner_user_id = ${context.userId}
      `;
    } else {
      await sql`
        update club
        set co_owner_user_id = null
        where id = ${club.id} and co_owner_user_id = ${context.userId}
      `;
    }
    await sql`delete from staff_membri where user_id = ${context.userId} and club_id = ${club.id}`;
    const sub = nascitaSub(todayRome());
    await sql`
      update profiles
      set role = 'subacqueo', ruolo = 'sub', club_id = null, piano = ${sub.piano}, prova_fino = ${sub.provaFino || null}
      where user_id = ${context.userId}
    `;
    const titolo = "Titolare ha abbandonato";
    const corpo = `${club.nome} · ${profile.nome} ${profile.cognome}`.replace(/\s+/g, " ").trim();
    try {
      await sql`
        insert into notifications (submission_id, title, body, audience, club_id, user_id, affiliazione_id)
        values (null, ${titolo}, ${corpo}, 'piattaforma', null, ${context.userId}, null)
      `;
      const gestori = await sql<{ user_id: string }>`
        select user_id from profiles where role = 'piattaforma'
      `;
      await pushUsers(sql, gestori.map((row) => row.user_id), titolo, corpo, "/notifiche");
    } catch {
      /* l'uscita resta valida anche se l'avviso non parte */
    }
    return pack(sql, context.userId);
  });

export const updateClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const nome = asText(raw.nome).trim().slice(0, 120);
    if (nome.length < 2) throw new Error("Il nome della scuola è obbligatorio.");
    const codice = asText(raw.codiceStaff).trim().slice(0, 40);
    if (codice.length < 6) throw new Error("Il codice staff deve avere almeno 6 caratteri.");
    return {
      nome,
      codiceFiscale: asText(raw.codiceFiscale).trim().slice(0, 20),
      sede: asText(raw.sede).trim().slice(0, 160),
      email: asText(raw.email).trim().slice(0, 120),
      telefono: asText(raw.telefono).trim().slice(0, 40),
      codiceStaff: codice,
      citta: asText(raw.citta).trim().slice(0, 80),
      provincia: asText(raw.provincia).trim().slice(0, 80),
      sito: asText(raw.sito).trim().slice(0, 200),
    };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const club = await requireOwner(sql, context.userId);
    await assertCodesFree(sql, Number(club.id), {
      allievi: club.codice_allievi,
      staff: data.codiceStaff,
      owner: club.codice_proprietario,
    });
    await sql`
      update club
      set nome = ${data.nome},
          codice_fiscale = ${data.codiceFiscale},
          sede = ${data.sede},
          email = ${data.email},
          telefono = ${data.telefono},
          codice_staff = ${data.codiceStaff},
          citta = ${data.citta},
          provincia = ${data.provincia},
          sito = ${data.sito}
      where id = ${club.id}
    `;
    return pack(sql, context.userId);
  });

type SaveInput = {
  id?: number;
  formKey: string;
  status: "bozza" | "inviato";
  payload: Record<string, string>;
  clubId?: number;
  quando?: string;
};

function oraDispositivo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function readSave(input: unknown): SaveInput {
  if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
  const raw = input as Record<string, unknown>;
  const formKey = asText(raw.formKey);
  const status = asText(raw.status);
  if (status !== "bozza" && status !== "inviato") throw new Error("Stato non valido.");
  let id: number | undefined;
  if (raw.id != null && raw.id !== "") {
    const n = Number(raw.id);
    if (!Number.isInteger(n) || n <= 0) throw new Error("Scheda non valida.");
    id = n;
  }
  let clubId: number | undefined;
  if (raw.clubId != null && raw.clubId !== "") {
    const n = Number(raw.clubId);
    if (!Number.isInteger(n) || n <= 0) throw new Error("Diving non valido.");
    clubId = n;
  }
  return { id, formKey, status, payload: asPayload(raw.payload), clubId, quando: oraDispositivo(raw.quando) };
}

const MODULI_SOLA_LETTURA = new Set([
  "registro-immersione",
  "scheda-cliente",
  "questionario-medico",
  "brevetto-esperienza",
  "informativa-consenso",
]);

export const saveSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readSave(input))
  .handler(async ({ context, data }): Promise<{ id: number; modifica?: { nome: string; modifiedAt: string } }> => {
    const form = formByKey(data.formKey);
    if (!form) throw new Error("Modulo sconosciuto.");
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    let club: ClubRow | null;
    let desk = false;
    const home = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    desk = deskOf(profile, home);
    if (!data.clubId) throw new Error("Scegli il diving a cui inviare il modulo.");
    club = await loadClubById(sql, data.clubId);
    if (!club || club.stato !== "attiva") throw new Error("Questo diving non è disponibile.");
    if (club.accetta_moduli != null && !asBool(club.accetta_moduli) && !desk) throw new Error("Questa scuola non accetta nuovi moduli.");
    const interno = Boolean(desk && profile.clubId === Number(club.id));
    if (!data.id && !interno && !(await destinatarioAperto(sql, club, todayRome()))) {
      throw new Error("Questo diving non è tra i destinatari.");
    }
    if (form.key === "scheda-istruttore" && !eTitolare(club, context.userId)) {
      throw new Error("Solo il titolare del diving registra le schede di istruttori e guide.");
    }
    if (form.key === "questionario-medico" && data.id) {
      const current = await sql<{ user_id: string }>`select user_id from submissions where id = ${data.id}`;
      const authorId = current[0]?.user_id;
      if (authorId && authorId !== context.userId && !eTitolare(club, context.userId)) {
        throw new Error("Le risposte sanitarie le modifica solo chi le ha inviate o il titolare.");
      }
    }
    const destinationId = Number(club.id);
    const payload = cleanPayload(form, data.payload);
    if (form.key === "registro-immersione" && data.status === "inviato") controllaPeriodoScheda(payload);
    if (form.key === "questionario-medico" || haCampiChiusi(form)) {
      if (data.status === "inviato" && !payload.cifrato) {
        throw new Error("Chiudi i dati sul telefono prima di inviare.");
      }
      if (data.status === "inviato" && (!payload.nome || !payload.cognome)) {
        throw new Error("Scrivi nome e cognome.");
      }
    } else if (data.status === "inviato") {
      const missing = missingFields(form, payload);
      if (missing.length) {
        throw new Error(`Compila i campi obbligatori: ${missing.slice(0, 3).join(", ")}`);
      }
    }
    if (form.key === "scheda-socio") {
      delete payload.numero_tessera;
      const oggi = todayRome();
      const corrente = Number(oggi.slice(0, 4));
      const scelto = Number(payload.anno_iscrizione);
      if (data.id) {
        const assegnato = await sql<{ numero: number | null; anno: number; stato: string }>`
          select numero, anno, stato from soci where submission_id = ${data.id} and stato = 'accettato' and numero is not null
        `;
        if (assegnato[0]?.numero) {
          payload.numero_tessera = String(assegnato[0].numero);
          payload.anno_iscrizione = String(assegnato[0].anno);
        }
      }
      if (!payload.numero_tessera && data.status === "inviato" && scelto !== corrente && scelto !== corrente + 1) {
        throw new Error("Scegli l'anno di iscrizione: quello in corso o il successivo.");
      }
    }
    const subject = subjectOf(form, payload);
    const dive = referenceDate(form, payload);
    const json = JSON.stringify(payload);
    let ownerId = context.userId;
    let previous: string | null = null;
    let id = data.id ?? 0;
    if (data.id) {
      const rows = await sql<{ user_id: string; status: string; club_id: number | null }>`
        select user_id, status, club_id from submissions where id = ${data.id}
      `;
      const row = rows[0];
      if (!row) throw new Error("Scheda non trovata.");
      if (row.user_id !== context.userId && (!desk || Number(row.club_id) !== profile.clubId)) {
        throw new Error("Non puoi modificare questa scheda.");
      }
      ownerId = row.user_id;
      previous = row.status;
      if (previous === "inviato" && MODULI_SOLA_LETTURA.has(form.key) && !desk) {
        throw new Error("Questa scheda è in sola lettura.");
      }
      await sql`
        update submissions
        set form_key = ${form.key},
            subject_name = ${subject},
            dive_date = ${dive},
            status = ${data.status},
            payload = ${json}::jsonb,
            club_id = ${destinationId},
            updated_at = coalesce(${data.quando ?? null}::timestamptz, now()),
            created_at = case
              when ${data.status} = 'inviato' and ${previous} is distinct from 'inviato'
                then coalesce(${data.quando ?? null}::timestamptz, now())
              else created_at
            end
        where id = ${data.id}
      `;
    } else {
      const author = `${profile.cognome} ${profile.nome}`.trim();
      const inserted = await sql<{ id: number }>`
        insert into submissions (user_id, author_name, form_key, subject_name, dive_date, status, payload, club_id, created_at, updated_at)
        values (${context.userId}, ${author}, ${form.key}, ${subject}, ${dive}, ${data.status}, ${json}::jsonb, ${destinationId}, coalesce(${data.quando ?? null}::timestamptz, now()), coalesce(${data.quando ?? null}::timestamptz, now()))
        returning id
      `;
      id = Number(inserted[0]?.id);
    }
    if (data.status === "inviato" && previous !== "inviato") {
      const author = await loadProfile(sql, ownerId);
      if (form.key === "scheda-istruttore" && author) {
        const nome = (payload.nome || author.nome).trim();
        const cognome = (payload.cognome || author.cognome).trim();
        const ruolo = payload.ruolo || "istruttore o guida";
        const telefono = (payload.telefono || author.telefono).trim() || "non indicato";
        const brevetto = [payload.didattica, payload.livello].filter(Boolean).join(" ");
        await notifySchool(
          sql,
          destinationId,
          "Scheda staff",
          `${cognome} ${nome} ha registrato la scheda come ${ruolo}. Telefono: ${telefono}.${brevetto ? ` Brevetto: ${brevetto}.` : ""}`,
          context.userId,
          id,
        );
      } else if (author) {
        const who = `${author.cognome} ${author.nome}`.trim();
        const sanitario = form.key === "questionario-medico";
        const socio = form.key === "scheda-socio";
        const title = sanitario ? "È arrivata una scheda" : socio ? "Nuova scheda socio" : "Nuova scheda registrata";
        const body = sanitario
          ? "È arrivata una scheda."
          : socio
            ? `${who} ha inviato la Scheda socio. Accettala per assegnare il numero.`
            : `${who} ha inviato «${form.title}» — ${subject}.`;
        await sql`
          insert into notifications (submission_id, title, body, audience, club_id)
          values (
            ${id},
            ${title},
            ${body},
            ${"staff"},
            ${destinationId}
          )
        `;
        await pushSchoolPhone(sql, destinationId, title, body, context.userId);
      }
    }
    let modifica: { nome: string; modifiedAt: string } | undefined;
    if (data.id && previous === "inviato" && data.status === "inviato" && MODULI_SOLA_LETTURA.has(form.key) && desk) {
      const nome = `${profile.cognome} ${profile.nome}`.trim() || "Staff";
      const logged = await sql<{ modified_at: string }>`
        insert into scheda_modifiche (submission_id, user_id, nome)
        values (${id}, ${context.userId}, ${nome})
        returning to_char(modified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as modified_at
      `;
      const modifiedAt = logged[0]?.modified_at;
      if (modifiedAt) modifica = { nome, modifiedAt };
    }
    return { id, modifica };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scheda non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<SubmissionDetail> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{
      id: number;
      user_id: string;
      club_id: number | null;
      author_name: string;
      form_key: string;
      subject_name: string;
      dive_date: string | null;
      status: "bozza" | "inviato";
      payload: unknown;
      created_at: string;
      updated_at: string;
      letto_il: string | null;
    }>`
      select id, user_id, club_id, author_name, form_key, subject_name, dive_date::text as dive_date, status, payload,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at,
             to_char(letto_il, 'YYYY-MM-DD"T"HH24:MI:SS') as letto_il
      from submissions where id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("Scheda non trovata.");
    if (row.user_id !== context.userId && !(await canDesk(sql, profile, row.club_id))) {
      throw new Error("Non puoi aprire questa scheda.");
    }
    const sulBanco = await canDesk(sql, profile, row.club_id);
    if (sulBanco && row.status === "inviato" && !row.letto_il) {
      await sql`update submissions set letto_il = now() where id = ${row.id} and letto_il is null`;
      if (row.user_id !== context.userId) {
        const form = formByKey(row.form_key);
        const sanitario = row.form_key === "questionario-medico";
        await pushUsers(
          sql,
          [row.user_id],
          "Scheda letta",
          sanitario
            ? "Il diving ha letto la scheda."
            : `${profile.nome} ${profile.cognome} ha letto «${form?.title ?? "la scheda"}».`,
          "/",
        );
      }
    }
    if (row.user_id !== context.userId) {
      const nome = `${profile.cognome} ${profile.nome}`.trim() || "Staff";
      await sql`
        insert into scheda_aperture (submission_id, user_id, nome)
        select ${row.id}, ${context.userId}, ${nome}
        where not exists (
          select 1 from scheda_aperture
          where submission_id = ${row.id} and user_id = ${context.userId} and opened_at > now() - interval '1 minute'
        )
      `;
    }
    const aperture = await sql<{ nome: string; opened_at: string }>`
      select nome, to_char(opened_at, 'YYYY-MM-DD"T"HH24:MI') as opened_at
      from scheda_aperture
      where submission_id = ${row.id}
      order by opened_at desc
      limit 12
    `;
    const modifiche = await sql<{ nome: string; modified_at: string }>`
      select nome, to_char(modified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as modified_at
      from scheda_modifiche
      where submission_id = ${row.id}
      order by modified_at desc
      limit 20
    `;
    const club = row.club_id == null ? null : await loadClubById(sql, Number(row.club_id));
    const ownerView = club ? eTitolare(club, context.userId) : false;
    const mine = row.user_id === context.userId;
    let payload = asPayload(row.payload);
    const apreChiusi = ownerView || (sulBanco && !mine);
    const riservato = row.form_key === "questionario-medico" && !mine && !apreChiusi;
    const positiva = payload.sintesi === "positiva" || medicalAlert(payload);
    if (payload.cifrato && !apreChiusi) {
      delete payload.cifrato;
      for (const key of Object.keys(payload)) if (campoDaChiudere(key)) delete payload[key];
    }
    if (apreChiusi && payload.cifrato) {
      for (const key of Object.keys(payload)) if (campoDaChiudere(key)) delete payload[key];
    }
    if (riservato) {
      payload = {
        cognome: payload.cognome ?? "",
        nome: payload.nome ?? "",
        sintesi: positiva
          ? "Risposta positiva: prima di entrare in acqua serve un medico."
          : "Nessuna risposta positiva.",
      };
    }
    return {
      id: Number(row.id),
      userId: row.user_id,
      authorName: row.author_name,
      formKey: row.form_key,
      subjectName: row.subject_name,
      diveDate: row.dive_date,
      status: row.status,
      payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mine,
      clubId: row.club_id == null ? null : Number(row.club_id),
      riservato,
      aperture: aperture.map((item) => ({ nome: item.nome, openedAt: item.opened_at })),
      modifiche: modifiche.map((item) => ({ nome: item.nome, modifiedAt: item.modified_at })),
    };
  });

export type VerificaLogbook = {
  totale: number;
  ultimi12: number;
  profonditaMax: number | null;
  ultima: string;
  avvisi: { chiave: string; vars: Record<string, string | number> }[];
};

export const verificaLogbookBrevetto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scheda non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<VerificaLogbook> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{ user_id: string; club_id: number | null; form_key: string; payload: unknown }>`
      select user_id, club_id, form_key, payload from submissions where id = ${data.id}
    `;
    const row = rows[0];
    if (!row || row.form_key !== "brevetto-esperienza") throw new Error("Scheda non trovata.");
    if (!(await canDesk(sql, profile, row.club_id))) throw new Error("Non puoi aprire questa scheda.");
    const righe = await sql<{ dive_date: string; depth_m: string }>`
      select dive_date::text as dive_date, depth_m
      from logbook_entries
      where user_id = ${row.user_id}
    `;
    const oggi = todayRome();
    const dal = mesiFa(oggi, 12);
    let totale = 0;
    let ultimi12 = 0;
    let profonditaMax: number | null = null;
    let ultima = "";
    for (const riga of righe) {
      const giorno = (riga.dive_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) continue;
      totale += 1;
      if (giorno >= dal) ultimi12 += 1;
      if (!ultima || giorno > ultima) ultima = giorno;
      const metri = metriIndicati(riga.depth_m ?? "");
      if (metri != null && (profonditaMax == null || metri > profonditaMax)) profonditaMax = metri;
    }
    const stats = { totale, ultimi12, profonditaMax, ultima };
    return { ...stats, avvisi: coerenzaLogbook(asPayload(row.payload), stats) };
  });

function mesiFa(oggi: string, mesi: number): string {
  const [y, m, d] = oggi.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() - mesi);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

function piegaTesto(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function limiteLivello(didattica: string, livello: string): number | null {
  const text = piegaTesto(`${didattica} ${livello}`);
  if (!text.trim()) return null;
  if (/\b(divemaster|dive master|istruttore|instructor|owsi|msdt)\b/.test(text)) return 40;
  if (/(\*\*\*|3\s*stelle|tre stelle|3\s*°|3\s*º|terzo grado|3\s*grado|\bp3\b|three star)/.test(text)) return 40;
  if (/\b(advanced|aowd|aow|rescue|master scuba)\b/.test(text)) return 30;
  if (/(\*\*|2\s*stelle|due stelle|2\s*°|2\s*º|secondo grado|2\s*grado|\bp2\b|two star)/.test(text)) return 30;
  if (/\b(discover|try dive|battesimo|bapteme)\b/.test(text) || /\bscuba diver\b/.test(text)) return 12;
  if (/(\*|1\s*stella|una stella|1\s*°|1\s*º|primo grado|1\s*grado|\bp1\b|one star)/.test(text)) return 18;
  if (/\b(open water|owd|ow)\b/.test(text)) return 18;
  return null;
}

function limiteConSpecialita(base: number | null, specialita: string, altra: string): number | null {
  const spec = piegaTesto(`${specialita} ${altra}`);
  if (/trimix|rebreather|decompress|grotta|penetrazione|cave|tecnica|technical/.test(spec)) return null;
  if (/profonda|\bdeep\b/.test(spec)) return base == null || base < 40 ? 40 : base;
  return base;
}

function interoCampo(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n);
}

function testoMetri(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function coerenzaLogbook(
  payload: Record<string, string>,
  stats: { totale: number; ultimi12: number; profonditaMax: number | null; ultima: string },
): { chiave: string; vars: Record<string, string | number> }[] {
  const avvisi: { chiave: string; vars: Record<string, string | number> }[] = [];
  const livello = (payload.livello ?? "").trim();
  const daLivello = limiteConSpecialita(limiteLivello(payload.didattica ?? "", livello), payload.specialita ?? "", payload.specialita_altra ?? "");
  const scritta = metriIndicati(payload.profondita_massima ?? "");
  if (stats.profonditaMax != null) {
    const candidati: { limite: number; fonte: "livello" | "modulo" }[] = [];
    if (daLivello != null && stats.profonditaMax > daLivello + 0.05) candidati.push({ limite: daLivello, fonte: "livello" });
    if (scritta != null && stats.profonditaMax > scritta + 0.05) candidati.push({ limite: scritta, fonte: "modulo" });
    candidati.sort((a, b) => a.limite - b.limite);
    const scelto = candidati[0];
    if (scelto) {
      const vars = { m: testoMetri(stats.profonditaMax), limite: testoMetri(scelto.limite) };
      if (scelto.fonte === "modulo") {
        avvisi.push({
          chiave: "Nel logbook la profondità massima è {m} m, oltre i {limite} m indicati come profondità massima consentita.",
          vars,
        });
      } else if (livello) {
        avvisi.push({
          chiave: "Nel logbook la profondità massima è {m} m, oltre i {limite} m del livello dichiarato ({livello}).",
          vars: { ...vars, livello },
        });
      } else {
        avvisi.push({
          chiave: "Nel logbook la profondità massima è {m} m, oltre i {limite} m del brevetto dichiarato.",
          vars,
        });
      }
    }
  }
  const totali = interoCampo(payload.immersioni_totali ?? "");
  const anno = interoCampo(payload.immersioni_12_mesi ?? "");
  const ultima = giornoIso(payload.ultima_immersione ?? "");
  const indica = (totali != null && totali > 0) || (anno != null && anno > 0) || Boolean(ultima);
  if (stats.totale === 0) {
    if (indica) avvisi.push({ chiave: "Nel logbook non ci sono immersioni, mentre il modulo ne indica.", vars: {} });
    return avvisi;
  }
  if (totali != null && totali !== stats.totale) {
    avvisi.push({
      chiave: "Il modulo dichiara {n} immersioni totali, il logbook ne ha {m}.",
      vars: { n: totali, m: stats.totale },
    });
  }
  if (anno != null && anno !== stats.ultimi12) {
    avvisi.push({
      chiave: "Il modulo dichiara {n} immersioni negli ultimi 12 mesi, il logbook ne ha {m}.",
      vars: { n: anno, m: stats.ultimi12 },
    });
  }
  if (ultima && stats.ultima && ultima !== stats.ultima) {
    avvisi.push({
      chiave: "Il modulo indica l'ultima immersione il {dichiarata}, il logbook il {logbook}.",
      vars: { dichiarata: ultima, logbook: stats.ultima },
    });
  }
  return avvisi;
}

export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scheda non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{ user_id: string; club_id: number | null }>`select user_id, club_id from submissions where id = ${data.id}`;
    const row = rows[0];
    if (!row) throw new Error("Scheda non trovata.");
    if (row.user_id !== context.userId && !(await canDesk(sql, profile, row.club_id))) {
      throw new Error("Non puoi eliminare questa scheda.");
    }
    if (row.user_id !== context.userId) await requireScuolaAperta(sql, profile);
    await sql`delete from notifications where submission_id = ${data.id}`;
    await sql`delete from scheda_modifiche where submission_id = ${data.id}`;
    await sql`delete from submissions where id = ${data.id}`;
    return { ok: true };
  });

type ListInput = {
  sort: "alpha" | "dive" | "created";
  group?: string;
  formKey?: string;
  q?: string;
  personali?: boolean;
  archivio?: boolean;
  creato?: string;
  immersione?: string;
};

function dataIso(value: unknown): string | undefined {
  const text = asText(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

export const contaModuliDaLeggere = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<number> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile?.clubId) return 0;
    const club = await loadClubById(sql, profile.clubId);
    if (!club || !deskOf(profile, club)) return 0;
    const rows = await sql<{ n: number }>`
      select count(*)::int as n
      from submissions
      where club_id = ${Number(club.id)}
        and status = 'inviato'
        and letto_il is null
    `;
    return Number(rows[0]?.n ?? 0);
  });

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown): ListInput => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const sort = asText(raw.sort);
    return {
      sort: sort === "alpha" || sort === "dive" ? sort : "created",
      group: asText(raw.group) || undefined,
      formKey: asText(raw.formKey) || undefined,
      q: asText(raw.q).trim().slice(0, 80) || undefined,
      personali: raw.personali === true,
      archivio: raw.archivio === true,
      creato: dataIso(raw.creato),
      immersione: dataIso(raw.immersione),
    };
  })
  .handler(async ({ context, data }): Promise<SubmissionListItem[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    const desk = deskOf(profile, club);
    const params: unknown[] = [];
    const where: string[] = [];
    if (profile.role === "subacqueo" || data.personali) {
      params.push(context.userId);
      where.push(`s.user_id = $${params.length}`);
    } else {
      if (profile.role === "piattaforma" && !desk) return [];
      if (!profile.clubId) throw new Error("Non sei collegato a una scuola.");
      if (desk && !data.archivio) await requireScuolaAperta(sql, profile);
      params.push(profile.clubId);
      where.push(`s.club_id = $${params.length}`);
      if (!desk) {
        params.push(context.userId);
        where.push(`s.user_id = $${params.length}`);
      }
    }
    if (data.formKey && formByKey(data.formKey)) {
      const keys = data.formKey === "registro-immersione" ? ["registro-immersione", "scheda-cliente"] : [data.formKey];
      params.push(keys);
      where.push(`s.form_key = any($${params.length})`);
    } else {
      const keys = keysForGroup(data.group);
      if (keys) {
        params.push(keys);
        where.push(`s.form_key = any($${params.length})`);
      }
    }
    if (data.q) {
      params.push(`%${data.q.replace(/[%_]/g, "")}%`);
      where.push(`(s.subject_name ilike $${params.length} or s.author_name ilike $${params.length})`);
    }
    if (data.creato) {
      params.push(data.creato);
      where.push(`s.created_at::date = $${params.length}::date`);
    }
    if (data.immersione) {
      params.push(data.immersione);
      where.push(`s.dive_date = $${params.length}::date`);
    }
    const limite = data.archivio ? 5000 : 1000;
    const text = `
      select s.id, s.user_id, s.author_name, s.form_key, s.subject_name, s.dive_date::text as dive_date, s.status, s.payload,
             to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at, c.nome as club_nome,
             (s.letto_il is not null) as letto
      from submissions s
      left join club c on c.id = s.club_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      ${data.archivio ? "order by s.created_at desc, s.id desc" : "order by (s.letto_il is null) desc, s.created_at desc, s.id desc"}
      limit ${limite}
    `;
    const rows = await sql.query<{
      id: number;
      user_id: string;
      author_name: string;
      form_key: string;
      subject_name: string;
      dive_date: string | null;
      status: "bozza" | "inviato";
      payload: unknown;
      created_at: string;
      club_nome: string | null;
      letto: boolean | string | null;
    }>(text, params);
    const items = rows.map((row) => {
      const payload = asPayload(row.payload);
      const extra = extraOf(row.form_key, payload);
      return {
        id: Number(row.id),
        userId: row.user_id,
        authorName: row.author_name,
        formKey: row.form_key,
        subjectName: row.subject_name,
        diveDate: row.dive_date,
        status: row.status,
        createdAt: row.created_at,
        mine: row.user_id === context.userId,
        extra: extra.extra,
        scadenza: extra.scadenza,
        esito: extra.esito,
        clubNome: row.club_nome ?? "",
        letto: row.letto === true || row.letto === "t" || row.letto === "true",
      } satisfies SubmissionListItem;
    });
    items.sort((a, b) => {
      if (data.sort === "alpha") {
        return a.subjectName.localeCompare(b.subjectName, "it", { sensitivity: "base" }) || b.id - a.id;
      }
      if (data.sort === "dive") {
        if (a.diveDate && b.diveDate && a.diveDate !== b.diveDate) return a.diveDate < b.diveDate ? 1 : -1;
        if (a.diveDate && !b.diveDate) return -1;
        if (!a.diveDate && b.diveDate) return 1;
        return b.id - a.id;
      }
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id;
    });
    return items;
  });

function vistaAvviso(input: unknown): "gestore" | "scuola" | "sub" {
  const vista = (input as { vista?: unknown } | null)?.vista;
  if (vista === "gestore" || vista === "scuola" || vista === "sub") return vista;
  throw new Error("Avviso non valido.");
}

function letto(value: boolean | string): boolean {
  return value === true || value === "t" || value === "true";
}

function corpoViaggio(title: string, body: string): { body: string; viaggioId: number } {
  if (title !== "Invia moduli viaggio") return { body, viaggioId: 0 };
  const taglio = body.indexOf("\n");
  const id = Number(taglio > 0 ? body.slice(0, taglio) : "");
  if (!Number.isInteger(id) || id <= 0) return { body, viaggioId: 0 };
  return { body: body.slice(taglio + 1), viaggioId: id };
}

async function vedeAvviso(sql: Sql, userId: string, id: number): Promise<boolean> {
  const rows = await sql<{ audience: string; club_id: number | null; user_id: string | null }>`
    select audience, club_id, user_id from notifications where id = ${id}
  `;
  const notice = rows[0];
  if (!notice) return false;
  const profile = await loadProfile(sql, userId);
  if (!profile) return false;
  if (notice.audience === "piattaforma") return profile.role === "piattaforma";
  if (notice.audience === "sub") return notice.user_id === userId;
  if (notice.audience !== "staff" && notice.audience !== "owner") return false;
  if (!profile.clubId || Number(notice.club_id) !== profile.clubId) return false;
  const club = await loadClubById(sql, profile.clubId);
  if (!club || !deskOf(profile, club)) return false;
  if (notice.audience === "owner" && !eTitolare(club, userId)) return false;
  return true;
}

export const listNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ vista: vistaAvviso(input) }))
  .handler(async ({ context, data }): Promise<{ allowed: boolean; items: Notice[] }> => {
    const sql = await getSql();
    await assicuraConvalide(sql);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return { allowed: false, items: [] };
    if (data.vista === "gestore") {
      if (profile.role !== "piattaforma") return { allowed: false, items: [] };
      await assicuraPiattaforma(sql);
      const rows = await sql<{
        id: number;
        title: string;
        body: string;
        created_at: string;
        read: boolean | string;
        anagrafica_nota: string | null;
        diving_nome: string | null;
        nome: string | null;
        cognome: string | null;
      }>`
        select n.id, n.title, n.body,
               to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
               exists(
                 select 1 from notification_reads r
                 where r.notification_id = n.id and r.user_id = ${context.userId}
               ) as read,
               a.anagrafica_nota, a.diving_nome, a.nome, a.cognome
        from notifications n
        left join affiliazioni a on a.id = n.affiliazione_id
        where n.audience = 'piattaforma'
          and (
            (a.id is not null and a.stato <> 'accettata')
            or (n.affiliazione_id is null and n.title in ('Nuova iscrizione', 'Titolare ha abbandonato', 'Richiesta mezzo nautico'))
          )
        order by n.created_at desc
        limit 80
      `;
      return {
        allowed: true,
        items: rows.map((row) => {
          const iscrizione = row.title === "Nuova iscrizione" || row.title === "Richiesta mezzo nautico";
          const abbandono = row.title === "Titolare ha abbandonato";
          return {
            id: Number(row.id),
            submissionId: 0,
            title: row.title,
            body: iscrizione || abbandono ? row.body : "",
            createdAt: row.created_at,
            read: letto(row.read),
            kind: abbandono ? ("abbandono" as const) : iscrizione ? ("iscrizione" as const) : ("affiliazione" as const),
            nota: iscrizione || abbandono ? null : leggiNotaAnagrafica(row.anagrafica_nota),
            divingNome: iscrizione || abbandono ? "" : (row.diving_nome ?? ""),
            persona: iscrizione || abbandono ? "" : `${row.cognome ?? ""} ${row.nome ?? ""}`.trim(),
          };
        }),
      };
    }
    if (data.vista === "sub") {
      await assicuraEsiti(sql, context.userId);
      await assicuraScadenzeSoci(sql, context.userId);
      const rows = await sql<{
        id: number;
        title: string;
        body: string;
        created_at: string;
        read: boolean | string;
        diving_nome: string | null;
        share_id: number | null;
        share_stato: string | null;
        share_from: string | null;
        convalida_id: number | null;
        convalida_stato: string | null;
        convalida_from: string | null;
      }>`
        select n.id, n.title, n.body,
               to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
               exists(
                 select 1 from notification_reads r
                 where r.notification_id = n.id and r.user_id = ${context.userId}
               ) as read,
               a.diving_nome,
               c.id as share_id,
               c.stato as share_stato,
               c.from_name as share_from,
               v.id as convalida_id,
               v.stato as convalida_stato,
               v.from_name as convalida_from
        from notifications n
        left join affiliazioni a on a.id = n.affiliazione_id
        left join logbook_condivisioni c on c.notification_id = n.id
        left join logbook_convalide v on v.notification_id = n.id
        where n.audience = 'sub'
          and n.user_id = ${context.userId}
        order by n.created_at desc
        limit 80
      `;
      return {
        allowed: true,
        items: rows.map((row) => {
          const viaggio = corpoViaggio(row.title, row.body);
          const convalida = Boolean(row.convalida_id);
          return {
            id: Number(row.id),
            submissionId: 0,
            title: row.title,
            body: viaggio.body,
            createdAt: row.created_at,
            read: letto(row.read),
            kind: convalida ? ("convalida" as const) : row.share_id ? ("condivisione" as const) : ("esito" as const),
            nota: null,
            divingNome: row.diving_nome ?? "",
            persona: convalida ? (row.convalida_from ?? "") : (row.share_from ?? ""),
            shareId: row.share_id ? Number(row.share_id) : viaggio.viaggioId,
            shareStato: convalida ? (row.convalida_stato ?? "") : (row.share_stato ?? ""),
            convalidaId: convalida ? Number(row.convalida_id) : undefined,
          };
        }),
      };
    }
    const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    const mie = await avvisiConvalida(sql, context.userId);
    if (!club || !deskOf(profile, club)) return { allowed: mie.length > 0, items: mie };
    const clubId = Number(club.id);
    const owner = eTitolare(club, profile.userId);
    const rows = await sql<{
      id: number;
      submission_id: number | null;
      title: string;
      body: string;
      created_at: string;
      read: boolean | string;
    }>`
      select n.id, n.submission_id, n.title, n.body,
             to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
             exists(
               select 1 from notification_reads r
               where r.notification_id = n.id and r.user_id = ${context.userId}
             ) as read
      from notifications n
      where n.club_id = ${clubId}
        and (n.audience = 'staff' or (${owner} and n.audience = 'owner'))
      order by n.created_at desc
      limit 80
    `;
    return {
      allowed: true,
      items: [...mie, ...rows.map((row) => ({
        id: Number(row.id),
        submissionId: Number(row.submission_id ?? 0),
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        read: letto(row.read),
        kind: "scheda" as const,
        nota: null,
        divingNome: "",
        persona: "",
      }))],
    };
  });

async function avvisiConvalida(sql: Sql, userId: string): Promise<Notice[]> {
  const rows = await sql<{
    id: number;
    title: string;
    body: string;
    created_at: string;
    read: boolean | string;
    convalida_id: number;
    stato: string;
    from_name: string;
  }>`
    select n.id, n.title, n.body,
           to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
           exists(
             select 1 from notification_reads r
             where r.notification_id = n.id and r.user_id = ${userId}
           ) as read,
           v.id as convalida_id, v.stato, v.from_name
    from notifications n
    join logbook_convalide v on v.notification_id = n.id
    where n.user_id = ${userId} and n.title = 'Convalida immersione'
    order by n.created_at desc
    limit 20
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    submissionId: 0,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    read: letto(row.read),
    kind: "convalida" as const,
    nota: null,
    divingNome: "",
    persona: row.from_name,
    shareStato: row.stato,
    convalidaId: Number(row.convalida_id),
  }));
}

export const markNoticeRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Avviso non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    if (!(await vedeAvviso(sql, context.userId, data.id))) throw new Error("Avviso non valido.");
    await sql`
      insert into notification_reads (notification_id, user_id)
      values (${data.id}, ${context.userId})
      on conflict (notification_id, user_id) do nothing
    `;
    return { ok: true };
  });

export const markAllNoticesRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ vista: vistaAvviso(input) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (data.vista === "gestore") {
      if (profile.role !== "piattaforma") throw new Error("Solo il gestore della piattaforma può farlo.");
      await sql`
        insert into notification_reads (notification_id, user_id)
        select n.id, ${context.userId}
        from notifications n
        left join affiliazioni a on a.id = n.affiliazione_id
        where n.audience = 'piattaforma'
          and (
            (a.id is not null and a.stato <> 'accettata')
            or (n.affiliazione_id is null and n.title in ('Nuova iscrizione', 'Titolare ha abbandonato', 'Richiesta mezzo nautico'))
          )
          and not exists (
            select 1 from notification_reads r
            where r.notification_id = n.id and r.user_id = ${context.userId}
          )
        on conflict (notification_id, user_id) do nothing
      `;
      return { ok: true };
    }
    if (data.vista === "sub") {
      await sql`
        insert into notification_reads (notification_id, user_id)
        select n.id, ${context.userId}
        from notifications n
        where n.audience = 'sub'
          and n.user_id = ${context.userId}
          and not exists (
            select 1 from notification_reads r
            where r.notification_id = n.id and r.user_id = ${context.userId}
          )
        on conflict (notification_id, user_id) do nothing
      `;
      return { ok: true };
    }
    const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!club || !deskOf(profile, club)) throw new Error("Solo la scuola può farlo.");
    const owner = eTitolare(club, profile.userId);
    await sql`
      insert into notification_reads (notification_id, user_id)
      select n.id, ${context.userId}
      from notifications n
      where n.club_id = ${club.id}
        and (n.audience = 'staff' or (${owner} and n.audience = 'owner'))
        and not exists (
          select 1 from notification_reads r
          where r.notification_id = n.id and r.user_id = ${context.userId}
        )
      on conflict (notification_id, user_id) do nothing
    `;
    return { ok: true };
  });

export type LogEntry = {
  id: number;
  data: string;
  localita: string;
  punto: string;
  profondita: string;
  minuti: string;
  buddy: string;
  miscela: string;
  ossigeno: string;
  temperatura: string;
  visibilita: string;
  note: string;
  lat: string;
  lng: string;
  ora: string;
  foto: number;
  voce: number;
  condivisaDa: string;
  decompressione: "" | "si" | "no";
  profilo: PuntoProfilo[];
  oraFine: string;
  centro: string;
  guidaNome: string;
  guidaFirma: string;
  profonditaPrevista: string;
  autorespiratore: string;
  brevetto: string;
  viaggioGruppoId: number | null;
  convalidaGuida: string;
};

const MIXES = ["Aria", "Nitrox", "Trimix"] as const;

function readLog(input: unknown): Omit<LogEntry, "id" | "foto" | "voce" | "condivisaDa" | "viaggioGruppoId" | "convalidaGuida"> & { id: number | null } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const id = Number(raw.id);
  const data = asText(raw.data).slice(0, 10);
  const localita = asText(raw.localita).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Indica la data dell'immersione.");
  if (!localita) throw new Error("Indica la località.");
  const num = (key: string, max: number) => {
    const value = asText(raw[key]).trim().replace(",", ".");
    if (!value) return "";
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(value) || Number(value) > max) {
      throw new Error("Controlla profondità, tempo e gli altri numeri.");
    }
    return value;
  };
  const miscela = asText(raw.miscela);
  const lat = coord(raw.lat, -90, 90);
  const lng = coord(raw.lng, -180, 180);
  if ((lat && !lng) || (!lat && lng)) throw new Error("Servono sia latitudine sia longitudine.");
  const decompressione = asText(raw.decompressione);
  if (decompressione !== "" && decompressione !== "si" && decompressione !== "no") throw new Error("Scegli se c'è stata decompressione.");
  const ora = oraLog(raw.ora);
  const oraFine = oraLog(raw.oraFine);
  const firma = asText(raw.guidaFirma);
  const respiratori = ["Circuito aperto", "Rebreather", "Aria di superficie"];
  const autorespiratore = asText(raw.autorespiratore);
  return {
    id: Number.isInteger(id) && id > 0 ? id : null,
    data,
    localita: localita.slice(0, 120),
    punto: asText(raw.punto).trim().slice(0, 120),
    profondita: num("profondita", 400),
    minuti: num("minuti", 600),
    buddy: asText(raw.buddy).trim().slice(0, 80),
    miscela: MIXES.includes(miscela as (typeof MIXES)[number]) ? miscela : "Aria",
    ossigeno: num("ossigeno", 100),
    temperatura: num("temperatura", 45),
    visibilita: num("visibilita", 80),
    note: asText(raw.note).trim().slice(0, 2000),
    lat,
    lng,
    decompressione,
    ora,
    oraFine,
    centro: asText(raw.centro).trim().slice(0, 120),
    guidaNome: asText(raw.guidaNome).trim().slice(0, 120),
    guidaFirma: firma.startsWith("data:image/png;base64,") && firma.length < 300_000 ? firma : "",
    profonditaPrevista: num("profonditaPrevista", 400),
    autorespiratore: respiratori.includes(autorespiratore) ? autorespiratore : "",
    brevetto: asText(raw.brevetto).trim().slice(0, 120),
    profilo: profiloDi(raw.profilo),
  };
}

function oraLog(value: unknown): string {
  const text = asText(value).trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function coord(value: unknown, min: number, max: number): string {
  const text = asText(value).trim().replace(",", ".");
  if (!text) return "";
  if (!/^-?\d{1,3}(\.\d{1,6})?$/.test(text)) throw new Error("Coordinate non valide.");
  const number = Number(text);
  if (number < min || number > max) throw new Error("Coordinate non valide.");
  return text;
}

function toLog(row: {
  id: number;
  dive_date: string;
  site: string;
  point: string;
  depth_m: string;
  minutes: string;
  buddy: string;
  mix: string;
  oxygen: string;
  temp_c: string;
  visibility_m: string;
  notes: string;
  lat: string;
  lng: string;
  dive_time: string;
  foto: number;
  voce: number;
  condivisa_da: string;
  dive_profile: string;
  decompressione: string;
  ora_fine: string;
  centro: string;
  guida_nome: string;
  guida_firma: string;
  profondita_prevista: string;
  autorespiratore: string;
  brevetto: string;
  viaggio_gruppo_id: number | null;
  convalida_guida: string | null;
}): LogEntry {
  const profilo = profiloDi(profiloJson(row.dive_profile));
  return {
    id: Number(row.id),
    data: row.dive_date.slice(0, 10),
    localita: row.site,
    punto: row.point,
    profondita: row.depth_m,
    minuti: row.minutes,
    buddy: row.buddy,
    miscela: row.mix,
    ossigeno: row.oxygen,
    temperatura: row.temp_c,
    visibilita: row.visibility_m,
    note: row.notes,
    lat: row.lat ?? "",
    lng: row.lng ?? "",
    ora: (row.dive_time ?? "").slice(0, 5),
    foto: Number(row.foto ?? 0),
    voce: Number(row.voce ?? 0),
    condivisaDa: row.condivisa_da ?? "",
    decompressione: row.decompressione === "si" || row.decompressione === "no" ? row.decompressione : "",
    profilo,
    oraFine: (row.ora_fine ?? "").slice(0, 5),
    centro: row.centro ?? "",
    guidaNome: row.guida_nome ?? "",
    guidaFirma: row.guida_firma ?? "",
    profonditaPrevista: row.profondita_prevista ?? "",
    autorespiratore: row.autorespiratore ?? "",
    brevetto: row.brevetto ?? "",
    viaggioGruppoId: row.viaggio_gruppo_id == null ? null : Number(row.viaggio_gruppo_id),
    convalidaGuida: row.convalida_guida ?? "",
  };
}

export const ultimaDataLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ data: string }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{ dive_date: string }>`
      select dive_date::text as dive_date
      from logbook_entries
      where user_id = ${context.userId}
      order by dive_date desc, id desc
      limit 1
    `;
    const giorno = (rows[0]?.dive_date ?? "").slice(0, 10);
    return { data: /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : "" };
  });

export const listLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LogEntry[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await assicuraConvalide(sql);
    await assicuraLibretto(sql);
    const rows = await sql<{
      id: number;
      dive_date: string;
      site: string;
      point: string;
      depth_m: string;
      minutes: string;
      buddy: string;
      mix: string;
      oxygen: string;
      temp_c: string;
      visibility_m: string;
      notes: string;
      lat: string;
      lng: string;
      dive_time: string;
      foto: number;
      voce: number;
      condivisa_da: string;
      dive_profile: string;
      decompressione: string;
      ora_fine: string;
      centro: string;
      guida_nome: string;
      guida_firma: string;
      profondita_prevista: string;
      autorespiratore: string;
      brevetto: string;
      viaggio_gruppo_id: number | null;
      convalida_guida: string | null;
    }>`
      select id, dive_date::text as dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, visibility_m, notes, lat, lng, dive_time, condivisa_da, dive_profile, decompressione,
        ora_fine, centro, guida_nome, guida_firma, profondita_prevista, autorespiratore, brevetto, viaggio_gruppo_id,
        (
          select trim(coalesce(p.cognome, '') || ' ' || coalesce(p.nome, ''))
          from logbook_convalide v
          join profiles p on p.user_id = v.to_user_id
          where v.entry_id = logbook_entries.id and v.stato = 'inviata'
          order by v.id desc
          limit 1
        ) as convalida_guida,
        (select count(*)::int from logbook_photos p where p.entry_id = logbook_entries.id) as foto,
        (select count(*)::int from logbook_voice v where v.entry_id = logbook_entries.id) as voce
      from logbook_entries
      where user_id = ${context.userId}
      order by dive_date desc, id desc
      limit 500
    `;
    return rows.map(toLog);
  });

export const saveLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readLog(input))
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (data.decompressione !== "si" && data.decompressione !== "no") throw new Error("Scegli se c'è stata decompressione.");
    await assicuraLibretto(sql);
    if (data.id) {
      const owned = await sql<{ id: number }>`
        select id from logbook_entries where id = ${data.id} and user_id = ${context.userId}
      `;
      if (!owned[0]) throw new Error("Questa immersione non è nel tuo logbook.");
      await sql`
        update logbook_entries
        set dive_date = ${data.data},
            site = ${data.localita},
            point = ${data.punto},
            depth_m = ${data.profondita},
            minutes = ${data.minuti},
            buddy = ${data.buddy},
            mix = ${data.miscela},
            oxygen = ${data.ossigeno},
            temp_c = ${data.temperatura},
            visibility_m = ${data.visibilita},
            notes = ${data.note},
            lat = ${data.lat},
            lng = ${data.lng},
            decompressione = ${data.decompressione},
            dive_time = ${data.ora},
            ora_fine = ${data.oraFine},
            dive_profile = ${JSON.stringify(data.profilo)},
            centro = ${data.centro},
            guida_nome = ${data.guidaNome},
            profondita_prevista = ${data.profonditaPrevista},
            autorespiratore = ${data.autorespiratore},
            brevetto = ${data.brevetto},
            guida_firma = case when ${data.guidaFirma} = '' then guida_firma else ${data.guidaFirma} end,
            updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}
      `;
      if (data.guidaFirma) {
        await assicuraConvalide(sql);
        await sql`update logbook_convalide set stato = 'sostituita' where entry_id = ${data.id} and stato = 'inviata'`;
      }
      return { id: data.id };
    }
    const inserted = await sql<{ id: number }>`
      insert into logbook_entries (
        user_id, dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, visibility_m, notes, lat, lng, decompressione,
        dive_time, ora_fine, dive_profile, centro, guida_nome, guida_firma, profondita_prevista, autorespiratore, brevetto
      ) values (
        ${context.userId}, ${data.data}, ${data.localita}, ${data.punto}, ${data.profondita},
        ${data.minuti}, ${data.buddy}, ${data.miscela}, ${data.ossigeno}, ${data.temperatura},
        ${data.visibilita}, ${data.note}, ${data.lat}, ${data.lng}, ${data.decompressione},
        ${data.ora}, ${data.oraFine}, ${JSON.stringify(data.profilo)}, ${data.centro}, ${data.guidaNome}, ${data.guidaFirma}, ${data.profonditaPrevista}, ${data.autorespiratore}, ${data.brevetto}
      )
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export type CompagnoLogbook = { userId: string; nome: string; cognome: string; foto: string };

export type ImmersioneCopia = {
  data: string;
  localita: string;
  punto: string;
  profondita: string;
  minuti: string;
  buddy: string;
  miscela: string;
  ossigeno: string;
  temperatura: string;
  visibilita: string;
  note: string;
  lat: string;
  lng: string;
  ora: string;
  decompressione: "" | "si" | "no";
};

function leggiCopia(input: unknown): ImmersioneCopia {
  const base = readLog(input);
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const oraRaw = asText(raw.ora).trim();
  return {
    data: base.data,
    localita: base.localita,
    punto: base.punto,
    profondita: base.profondita,
    minuti: base.minuti,
    buddy: base.buddy,
    miscela: base.miscela,
    ossigeno: base.ossigeno,
    temperatura: base.temperatura,
    visibilita: base.visibilita,
    note: base.note,
    lat: base.lat,
    lng: base.lng,
    ora: /^([01]\d|2[0-3]):[0-5]\d$/.test(oraRaw) ? oraRaw : "",
    decompressione: base.decompressione,
  };
}

function copiaDaRiga(value: unknown): ImmersioneCopia {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (typeof value === "string") {
    try {
      return copiaDaRiga(JSON.parse(value));
    } catch {
      throw new Error("Immersione non valida.");
    }
  }
  return leggiCopia(row);
}

async function inserisciCopia(sql: Sql, userId: string, copia: ImmersioneCopia, da: string): Promise<number> {
  const inserted = await sql<{ id: number }>`
    insert into logbook_entries (
      user_id, dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, visibility_m, notes, lat, lng, dive_time, condivisa_da, decompressione
    ) values (
      ${userId}, ${copia.data}, ${copia.localita}, ${copia.punto}, ${copia.profondita},
      ${copia.minuti}, ${copia.buddy}, ${copia.miscela}, ${copia.ossigeno}, ${copia.temperatura},
      ${copia.visibilita}, ${copia.note}, ${copia.lat}, ${copia.lng}, ${copia.ora}, ${da.slice(0, 120)}, ${copia.decompressione}
    )
    returning id
  `;
  return Number(inserted[0]?.id);
}

export const cercaCompagni = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const q = asText((input as { q?: unknown } | null)?.q).trim().slice(0, 40);
    if (q.length < 2) throw new Error("Scrivi almeno due lettere.");
    return { q };
  })
  .handler(async ({ context, data }): Promise<CompagnoLogbook[]> => {
    const sql = await getSql();
    const like = `%${data.q.replace(/[%_]/g, "")}%`;
    const rows = await sql<{ user_id: string; nome: string | null; cognome: string | null; foto_data: string | null }>`
      select user_id, nome, cognome, foto_data
      from profiles
      where user_id <> ${context.userId}
        and (
          nome ilike ${like}
          or cognome ilike ${like}
          or (coalesce(nome, '') || ' ' || coalesce(cognome, '')) ilike ${like}
          or (coalesce(cognome, '') || ' ' || coalesce(nome, '')) ilike ${like}
        )
      order by cognome nulls last, nome nulls last
      limit 12
    `;
    return rows.flatMap((row) => {
      const nome = (row.nome ?? "").trim();
      const cognome = (row.cognome ?? "").trim();
      if (!nome && !cognome) return [];
      const foto = row.foto_data?.startsWith("data:image/") ? row.foto_data : "";
      return [{ userId: row.user_id, nome, cognome, foto }];
    });
  });

export const cercaDivingGuida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const q = asText((input as { q?: unknown } | null)?.q).trim().slice(0, 60);
    if (q.length < 2) throw new Error("Scrivi almeno due lettere.");
    return { q };
  })
  .handler(async ({ data }): Promise<{ id: number; nome: string; sede: string }[]> => {
    const sql = await getSql();
    const like = `%${data.q.replace(/[%_]/g, "")}%`;
    const rows = await sql<{ id: number; nome: string; sede: string }>`
      select id, nome, coalesce(sede, '') as sede
      from club
      where coalesce(stato, 'attiva') = 'attiva'
        and (nome ilike ${like} or sede ilike ${like} or citta ilike ${like})
      order by nome, id
      limit 12
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome, sede: row.sede }));
  });

export const guideDelDiving = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const clubId = Number((input as { clubId?: unknown } | null)?.clubId);
    if (!Number.isInteger(clubId) || clubId <= 0) throw new Error("Scegli il diving.");
    return { clubId };
  })
  .handler(async ({ context, data }): Promise<CompagnoLogbook[]> => {
    const sql = await getSql();
    const club = await sql<{ id: number }>`
      select id from club where id = ${data.clubId} and coalesce(stato, 'attiva') = 'attiva' limit 1
    `;
    if (!club[0]) return [];
    const rows = await sql<{ user_id: string; nome: string | null; cognome: string | null }>`
      select distinct p.user_id, p.nome, p.cognome
      from profiles p
      where p.user_id <> ${context.userId}
        and (
          p.user_id in (select owner_user_id from club where id = ${data.clubId} and owner_user_id is not null)
          or p.user_id in (select co_owner_user_id from club where id = ${data.clubId} and co_owner_user_id is not null)
          or p.user_id in (select user_id from staff_membri where club_id = ${data.clubId})
        )
      order by p.cognome nulls last, p.nome nulls last
    `;
    return rows.flatMap((row) => {
      const nome = (row.nome ?? "").trim();
      const cognome = (row.cognome ?? "").trim();
      if (!nome && !cognome) return [];
      return [{ userId: row.user_id, nome, cognome, foto: "" }];
    });
  });

export const condividiImmersione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const entryId = Number(raw.entryId);
    const ids = Array.isArray(raw.userIds) ? raw.userIds : [];
    const userIds = [...new Set(ids.map((id) => asText(id).trim()).filter(Boolean))].slice(0, 12);
    if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Immersione non valida.");
    if (!userIds.length) throw new Error("Seleziona almeno un compagno.");
    return { entryId, userIds };
  })
  .handler(async ({ context, data }): Promise<{ inviati: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const righe = await sql<{
      dive_date: string;
      site: string;
      point: string;
      depth_m: string;
      minutes: string;
      buddy: string;
      mix: string;
      oxygen: string;
      temp_c: string;
      visibility_m: string;
      notes: string;
      lat: string;
      lng: string;
      dive_time: string;
      decompressione: string;
    }>`
      select dive_date::text as dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, visibility_m, notes, lat, lng, dive_time, decompressione
      from logbook_entries
      where id = ${data.entryId} and user_id = ${context.userId}
    `;
    const riga = righe[0];
    if (!riga) throw new Error("Questa immersione non è nel tuo logbook.");
    const copia: ImmersioneCopia = {
      data: riga.dive_date.slice(0, 10),
      localita: riga.site,
      punto: riga.point,
      profondita: riga.depth_m,
      minuti: riga.minutes,
      buddy: riga.buddy,
      miscela: riga.mix,
      ossigeno: riga.oxygen,
      temperatura: riga.temp_c,
      visibilita: riga.visibility_m,
      note: riga.notes,
      lat: riga.lat ?? "",
      lng: riga.lng ?? "",
      ora: (riga.dive_time ?? "").slice(0, 5),
      decompressione: riga.decompressione === "si" || riga.decompressione === "no" ? riga.decompressione : "",
    };
    const da = `${profile.nome} ${profile.cognome}`.trim() || "Un subacqueo";
    const json = JSON.stringify(copia);
    const titolo = "Immersione condivisa";
    let inviati = 0;
    const avvisati: string[] = [];
    for (const userId of data.userIds) {
      if (userId === context.userId) continue;
      const destinatario = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${userId} limit 1`;
      if (!destinatario[0]) continue;
      const gia = await sql<{ id: number }>`
        select id from logbook_condivisioni
        where entry_id = ${data.entryId} and to_user_id = ${userId} and stato = 'inviata'
        limit 1
      `;
      if (gia[0]) continue;
      const corpo = `Hai ricevuto un'immersione da ${da}. Vuoi salvarla nel tuo Logbook?`;
      const nota = await sql<{ id: number }>`
        insert into notifications (submission_id, title, body, audience, club_id, user_id)
        values (null, ${titolo}, ${corpo}, 'sub', null, ${userId})
        returning id
      `;
      const notificationId = Number(nota[0]?.id);
      await sql`
        insert into logbook_condivisioni (entry_id, from_user_id, to_user_id, from_name, stato, payload, notification_id)
        values (${data.entryId}, ${context.userId}, ${userId}, ${da}, 'inviata', ${json}::jsonb, ${notificationId || null})
      `;
      avvisati.push(userId);
      inviati += 1;
    }
    if (avvisati.length) {
      await pushUsers(sql, avvisati, titolo, `Hai ricevuto un'immersione da ${da}. Vuoi salvarla nel tuo Logbook?`, "/notifiche");
    }
    if (!inviati) throw new Error("Nessun compagno nuovo da avvisare.");
    return { inviati };
  });

export const chiediConvalida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const entryId = Number(raw.entryId);
    const guidaUserId = asText(raw.guidaUserId).trim();
    if (!Number.isInteger(entryId) || entryId <= 0 || !guidaUserId) throw new Error("Scegli la guida.");
    return { entryId, guidaUserId };
  })
  .handler(async ({ context, data }): Promise<{ guida: string }> => {
    const sql = await getSql();
    await assicuraConvalide(sql);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (data.guidaUserId === context.userId) throw new Error("Scegli un'altra persona.");
    const guida = await sql<{ nome: string | null; cognome: string | null }>`
      select nome, cognome from profiles where user_id = ${data.guidaUserId} limit 1
    `;
    if (!guida[0]) throw new Error("Questa guida non è su Tritone.");
    const righe = await sql<{ dive_date: string; site: string; point: string; depth_m: string; guida_firma: string; viaggio_gruppo_id: number | null }>`
      select dive_date::text as dive_date, site, point, depth_m, guida_firma, viaggio_gruppo_id
      from logbook_entries
      where id = ${data.entryId} and user_id = ${context.userId}
      limit 1
    `;
    const entry = righe[0];
    if (!entry) throw new Error("Questa immersione non è nel tuo logbook.");
    if (entry.viaggio_gruppo_id) throw new Error("Questa immersione arriva da un viaggio.");
    if ((entry.guida_firma ?? "").length > 0) throw new Error("Questa immersione è già validata.");
    const nomeGuida = `${(guida[0].cognome ?? "").trim()} ${(guida[0].nome ?? "").trim()}`.trim();
    const da = `${profile.nome} ${profile.cognome}`.trim() || "Un subacqueo";
    const quando = entry.dive_date.slice(0, 10);
    const dove = [entry.point || entry.site, entry.depth_m ? `${entry.depth_m} m` : ""].filter(Boolean).join(", ");
    const corpo = `${da} ti chiede di convalidare l'immersione del ${quando}${dove ? ` a ${dove}` : ""}.`;
    await sql`update logbook_convalide set stato = 'sostituita' where entry_id = ${data.entryId} and stato = 'inviata'`;
    const nota = await sql<{ id: number }>`
      insert into notifications (submission_id, title, body, audience, club_id, user_id)
      values (null, 'Convalida immersione', ${corpo}, 'sub', null, ${data.guidaUserId})
      returning id
    `;
    const notificationId = Number(nota[0]?.id);
    await sql`
      insert into logbook_convalide (entry_id, from_user_id, to_user_id, from_name, stato, notification_id)
      values (${data.entryId}, ${context.userId}, ${data.guidaUserId}, ${da}, 'inviata', ${notificationId || null})
    `;
    await pushUsers(sql, [data.guidaUserId], "Convalida immersione", corpo, "/notifiche");
    return { guida: nomeGuida };
  });

export const convalideInAttesa = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: number; da: string; testo: string }[]> => {
    const sql = await getSql();
    await assicuraConvalide(sql);
    const rows = await sql<{ id: number; from_name: string; body: string | null; dive_date: string; site: string; point: string }>`
      select v.id, v.from_name, n.body, e.dive_date::text as dive_date, e.site, e.point
      from logbook_convalide v
      join logbook_entries e on e.id = v.entry_id
      left join notifications n on n.id = v.notification_id
      where v.to_user_id = ${context.userId} and v.stato = 'inviata'
      order by v.id desc
      limit 10
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      da: row.from_name,
      testo: row.body || `${row.from_name} ti chiede di convalidare l'immersione del ${row.dive_date.slice(0, 10)} a ${row.point || row.site}.`,
    }));
  });

export const firmaConvalida = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const firma = asText(raw.firma);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Richiesta non valida.");
    if (!firma.startsWith("data:image/png;base64,") || firma.length >= 300_000) throw new Error("Firma col dito.");
    return { id, firma };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await assicuraConvalide(sql);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{ entry_id: number; from_user_id: string }>`
      select entry_id, from_user_id from logbook_convalide
      where id = ${data.id} and to_user_id = ${context.userId} and stato = 'inviata'
      limit 1
    `;
    const richiesta = rows[0];
    if (!richiesta) throw new Error("Questa richiesta non è più in attesa.");
    const nome = `${profile.cognome} ${profile.nome}`.trim();
    const updated = await sql<{ id: number }>`
      update logbook_entries
      set guida_nome = ${nome}, guida_firma = ${data.firma}, updated_at = now()
      where id = ${richiesta.entry_id} and user_id = ${richiesta.from_user_id} and coalesce(guida_firma, '') = '' and viaggio_gruppo_id is null
      returning id
    `;
    if (!updated[0]) throw new Error("Questa immersione è già validata.");
    await sql`update logbook_convalide set stato = 'firmata' where id = ${data.id}`;
    await sql`
      insert into notification_reads (notification_id, user_id)
      select notification_id, ${context.userId}
      from logbook_convalide
      where id = ${data.id} and notification_id is not null
      on conflict (notification_id, user_id) do nothing
    `;
    const corpo = `${nome} ha convalidato la tua immersione.`;
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id, user_id)
      values (null, 'Immersione validata', ${corpo}, 'sub', null, ${richiesta.from_user_id})
    `;
    await pushUsers(sql, [richiesta.from_user_id], "Immersione validata", corpo, "/logbook");
    return { ok: true };
  });

export const leggiCondivisione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<ImmersioneCopia & { da: string }> => {
    const sql = await getSql();
    const rows = await sql<{ payload: unknown; from_name: string }>`
      select payload, from_name
      from logbook_condivisioni
      where id = ${data.id} and to_user_id = ${context.userId} and stato = 'inviata'
    `;
    const row = rows[0];
    if (!row) throw new Error("Questa immersione non è più in attesa.");
    return { ...copiaDaRiga(row.payload), da: row.from_name };
  });

export const accettaCondivisione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    const immersione = raw.immersione && typeof raw.immersione === "object" ? leggiCopia(raw.immersione) : null;
    return { id, immersione };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const rows = await sql<{ payload: unknown; from_name: string; notification_id: number | null }>`
      select payload, from_name, notification_id
      from logbook_condivisioni
      where id = ${data.id} and to_user_id = ${context.userId} and stato = 'inviata'
    `;
    const row = rows[0];
    if (!row) throw new Error("Questa immersione non è più in attesa.");
    const copia = data.immersione ?? copiaDaRiga(row.payload);
    if (copia.decompressione !== "si" && copia.decompressione !== "no") throw new Error("Scegli se c'è stata decompressione.");
    const savedId = await inserisciCopia(sql, context.userId, copia, row.from_name);
    await sql`
      update logbook_condivisioni
      set stato = 'salvata', saved_entry_id = ${savedId}
      where id = ${data.id} and to_user_id = ${context.userId}
    `;
    if (row.notification_id) {
      await sql`
        insert into notification_reads (notification_id, user_id)
        values (${row.notification_id}, ${context.userId})
        on conflict (notification_id, user_id) do nothing
      `;
    }
    return { id: savedId };
  });

export const rifiutaCondivisione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ notification_id: number | null }>`
      update logbook_condivisioni
      set stato = 'rifiutata'
      where id = ${data.id} and to_user_id = ${context.userId} and stato = 'inviata'
      returning notification_id
    `;
    const row = rows[0];
    if (!row) throw new Error("Questa immersione non è più in attesa.");
    if (row.notification_id) {
      await sql`
        insert into notification_reads (notification_id, user_id)
        values (${row.notification_id}, ${context.userId})
        on conflict (notification_id, user_id) do nothing
      `;
    }
    return { ok: true };
  });

export const chiaviLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ data: string; ora: string }[]> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const rows = await sql<{ dive_date: string; dive_time: string }>`
      select dive_date::text as dive_date, dive_time
      from logbook_entries
      where user_id = ${context.userId}
    `;
    return rows.map((row) => ({ data: row.dive_date.slice(0, 10), ora: (row.dive_time ?? "").slice(0, 5) }));
  });

export const importaLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ immersioni: leggiImport(input) }))
  .handler(async ({ context, data }): Promise<{ inserite: number; saltate: number }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    let inserite = 0;
    let saltate = 0;
    const viste = new Set<string>();
    for (const riga of data.immersioni) {
      const chiave = chiaveQuando(riga.data, riga.ora);
      if (viste.has(chiave)) {
        saltate += 1;
        continue;
      }
      viste.add(chiave);
      const existing = await sql<{ id: number }>`
        select id from logbook_entries
        where user_id = ${context.userId} and dive_date = ${riga.data} and dive_time = ${riga.ora}
        limit 1
      `;
      if (existing[0]) {
        saltate += 1;
        continue;
      }
      await sql`
        insert into logbook_entries (
          user_id, dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, visibility_m, notes, lat, lng, dive_time, dive_profile
        ) values (
          ${context.userId}, ${riga.data}, ${riga.localita}, ${riga.punto}, ${riga.profondita},
          ${riga.minuti}, ${riga.buddy}, ${riga.miscela}, ${riga.ossigeno}, ${riga.temperatura},
          ${""}, ${riga.note}, ${riga.lat}, ${riga.lng}, ${riga.ora}, ${riga.profilo.length ? JSON.stringify(riga.profilo) : ""}
        )
      `;
      inserite += 1;
    }
    return { inserite, saltate };
  });

export const esportaLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as { tutto?: unknown; ids?: unknown }) : {};
    const tutto = raw.tutto === true;
    const ids = Array.isArray(raw.ids)
      ? [...new Set(raw.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 2000)
      : [];
    if (!tutto && ids.length === 0) throw new Error("Scegli almeno un'immersione.");
    return { tutto, ids };
  })
  .handler(async ({ context, data }): Promise<{ xml: string; nome: string }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const rows = await sql<{
      id: number;
      dive_date: string;
      site: string;
      point: string;
      depth_m: string;
      minutes: string;
      buddy: string;
      mix: string;
      oxygen: string;
      temp_c: string;
      notes: string;
      lat: string;
      lng: string;
      dive_time: string;
      dive_profile: string;
    }>`
      select id, dive_date::text as dive_date, site, point, depth_m, minutes, buddy, mix, oxygen, temp_c, notes, lat, lng, dive_time, dive_profile
      from logbook_entries
      where user_id = ${context.userId}
      order by dive_date, dive_time, id
      limit 5000
    `;
    const scelti = new Set(data.ids);
    const righe = rows.filter((row) => data.tutto || scelti.has(Number(row.id))).map(rigaUddf);
    if (!righe.length) throw new Error("Nessuna immersione da esportare.");
    return { xml: scriviUddf(righe), nome: "tritone-logbook.uddf" };
  });

function leggiImport(input: unknown): UddfRiga[] {
  const raw = input && typeof input === "object" ? (input as { immersioni?: unknown }).immersioni : null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2000) throw new Error("Scegli almeno un'immersione.");
  const out: UddfRiga[] = [];
  for (const item of raw) {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!row) continue;
    const data = asText(row.data).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const oraRaw = asText(row.ora).trim();
    const ora = /^([01]\d|2[0-3]):[0-5]\d$/.test(oraRaw) ? oraRaw : "";
    let lat = coordMorbida(row.lat, -90, 90);
    let lng = coordMorbida(row.lng, -180, 180);
    if (!lat || !lng) {
      lat = "";
      lng = "";
    }
    const miscela = asText(row.miscela);
    out.push({
      data,
      ora,
      localita: asText(row.localita).trim().slice(0, 120) || "Sito non indicato",
      punto: asText(row.punto).trim().slice(0, 120),
      profondita: numLog(row.profondita, 400),
      minuti: numLog(row.minuti, 1440),
      lat,
      lng,
      buddy: asText(row.buddy).trim().slice(0, 80),
      miscela: miscela === "Nitrox" || miscela === "Trimix" ? miscela : "Aria",
      ossigeno: numLog(row.ossigeno, 100),
      temperatura: numLog(row.temperatura, 45),
      note: asText(row.note).trim().slice(0, 2000),
      profilo: profiloDi(row.profilo),
    });
  }
  if (!out.length) throw new Error("Scegli almeno un'immersione.");
  return out;
}

function numLog(value: unknown, max: number): string {
  const text = asText(value).trim().replace(",", ".");
  if (!text || !/^\d{1,4}(\.\d{1,2})?$/.test(text) || Number(text) > max) return "";
  return text;
}

function coordMorbida(value: unknown, min: number, max: number): string {
  try {
    return coord(value, min, max);
  } catch {
    return "";
  }
}

function profiloDi(value: unknown): PuntoProfilo[] {
  if (!Array.isArray(value)) return [];
  const punti: PuntoProfilo[] = [];
  for (const item of value.slice(0, 800)) {
    if (!item || typeof item !== "object") continue;
    const t = Number((item as { t?: unknown }).t);
    const d = Number((item as { d?: unknown }).d);
    if (!Number.isFinite(t) || !Number.isFinite(d) || t < 0 || t > 200_000 || d < 0 || d > 400) continue;
    punti.push({ t: Math.round(t), d: Math.round(d * 100) / 100 });
  }
  return punti;
}

function rigaUddf(row: {
  dive_date: string;
  site: string;
  point: string;
  depth_m: string;
  minutes: string;
  buddy: string;
  mix: string;
  oxygen: string;
  temp_c: string;
  notes: string;
  lat: string;
  lng: string;
  dive_time: string;
  dive_profile: string;
}): UddfRiga {
  return {
    data: row.dive_date.slice(0, 10),
    ora: (row.dive_time ?? "").slice(0, 5),
    localita: row.site || "Sito non indicato",
    punto: row.point ?? "",
    profondita: row.depth_m ?? "",
    minuti: row.minutes ?? "",
    lat: row.lat ?? "",
    lng: row.lng ?? "",
    buddy: row.buddy ?? "",
    miscela: row.mix === "Nitrox" || row.mix === "Trimix" ? row.mix : "Aria",
    ossigeno: row.oxygen ?? "",
    temperatura: row.temp_c ?? "",
    note: row.notes ?? "",
    profilo: profiloDi(profiloJson(row.dive_profile)),
  };
}

function profiloJson(value: string): unknown {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export const deleteLogbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await sql`delete from logbook_photos where entry_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from logbook_voice where entry_id = ${data.id} and user_id = ${context.userId}`;
    const gone = await sql<{ id: number }>`
      delete from logbook_entries where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!gone[0]) throw new Error("Questa immersione non è nel tuo logbook.");
    return { ok: true };
  });

export type LogPhoto = {
  id: number;
  name: string;
  data: string;
};

export const listLogPhotos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<LogPhoto[]> => {
    const sql = await getSql();
    const owned = await sql<{ id: number }>`
      select id from logbook_entries where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!owned[0]) throw new Error("Questa immersione non è nel tuo logbook.");
    const rows = await sql<{ id: number; file_name: string; file_data: string }>`
      select id, file_name, file_data
      from logbook_photos
      where entry_id = ${data.id} and user_id = ${context.userId}
      order by id
    `;
    return rows.map((row) => ({ id: Number(row.id), name: row.file_name, data: row.file_data }));
  });

export const addLogPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const entryId = Number(raw.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Immersione non valida.");
    const file = readStoredFile(raw.file);
    if (!file.type.startsWith("image/")) throw new Error("Qui si aggiungono solo foto.");
    return { entryId, file };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const owned = await sql<{ id: number }>`
      select id from logbook_entries where id = ${data.entryId} and user_id = ${context.userId}
    `;
    if (!owned[0]) throw new Error("Questa immersione non è nel tuo logbook.");
    const count = await sql<{ n: number }>`
      select count(*)::int as n from logbook_photos where entry_id = ${data.entryId} and user_id = ${context.userId}
    `;
    if (Number(count[0]?.n ?? 0) >= 12) throw new Error("Puoi aggiungere fino a 12 foto per immersione.");
    const inserted = await sql<{ id: number }>`
      insert into logbook_photos (entry_id, user_id, file_name, file_type, file_data)
      values (${data.entryId}, ${context.userId}, ${data.file.name}, ${data.file.type}, ${data.file.data})
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const deleteLogPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Foto non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from logbook_photos where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Questa foto non è nel tuo logbook.");
    return { ok: true };
  });

export type LogVoice = {
  type: string;
  data: string;
};

function readVoiceFile(value: unknown): LogVoice {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const type = asText(raw.type).split(";")[0].trim().slice(0, 40);
  const data = asText(raw.data);
  if (!type.startsWith("audio/") || !data.startsWith("data:audio/") || data.length > 2_800_000) {
    throw new Error("La nota vocale non è valida, oppure supera i 2 minuti.");
  }
  return { type, data };
}

export const getLogVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<LogVoice | null> => {
    const sql = await getSql();
    const rows = await sql<{ file_type: string; file_data: string }>`
      select file_type, file_data
      from logbook_voice
      where entry_id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return { type: row.file_type, data: row.file_data };
  });

export const saveLogVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const entryId = Number(raw.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Immersione non valida.");
    return { entryId, file: readVoiceFile(raw.file) };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requireSpeciePro(sql, context.userId);
    const owned = await sql<{ id: number }>`
      select id from logbook_entries where id = ${data.entryId} and user_id = ${context.userId}
    `;
    if (!owned[0]) throw new Error("Questa immersione non è nel tuo logbook.");
    await sql`
      insert into logbook_voice (entry_id, user_id, file_type, file_data)
      values (${data.entryId}, ${context.userId}, ${data.file.type}, ${data.file.data})
      on conflict (entry_id) do update
      set user_id = ${context.userId}, file_type = ${data.file.type}, file_data = ${data.file.data}, created_at = now()
    `;
    return { ok: true };
  });

export const deleteLogVoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Immersione non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`delete from logbook_voice where entry_id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export type Brevetto = {
  id: number;
  titolo: string;
  ente: string;
  livello: string;
  numero: string;
  rilascio: string;
  scadenza: string;
  note: string;
  profondita: string;
  fileName: string;
  fileType: string;
  hasFile: boolean;
};

export type Pezzo = {
  id: number;
  nome: string;
  marca: string;
  matricola: string;
  collaudo: string;
  scadenza: string;
  note: string;
};

export type ScadenzaPersonale = {
  kind: "brevetto" | "attrezzo" | "medico" | "assicurazione" | "socio";
  id: number;
  titolo: string;
  scadenza: string;
};

type StoredFile = { name: string; type: string; data: string };
type FileAction = "keep" | "clear" | "replace";

function asFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

function readDay(value: unknown, label: string): string {
  const day = asText(value).slice(0, 10);
  if (!day) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Controlla la data: ${label}.`);
  return day;
}

function readStoredFile(value: unknown): StoredFile {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const type = asText(raw.type);
  const data = asText(raw.data);
  const allowed = type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "application/pdf";
  if (!allowed || !data.startsWith(`data:${type}`) || data.length > 2_200_000) {
    throw new Error("Usa una foto o un PDF, entro 1,5 MB.");
  }
  return { name: asText(raw.name).trim().slice(0, 80) || "documento", type, data };
}

function readClosedFile(value: unknown): StoredFile {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const type = asText(raw.type);
  const data = asText(raw.data);
  const allowed = type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "application/pdf";
  if (!allowed || !data.startsWith("{") || data.length > 3_200_000) {
    throw new Error("Il file va chiuso sul telefono prima di salvarlo.");
  }
  return { name: asText(raw.name).trim().slice(0, 80) || "documento", type, data };
}

function metriBrevetto(value: unknown): string {
  const text = asText(value).trim();
  if (!text) return "";
  const n = metriIndicati(text);
  if (n == null) throw new Error("Indica la profondità in metri.");
  return Number.isInteger(n) ? String(n) : String(n);
}

function readBrevetto(input: unknown): {
  id: number | null;
  titolo: string;
  ente: string;
  livello: string;
  numero: string;
  rilascio: string;
  scadenza: string;
  note: string;
  profondita: string;
  fileAction: FileAction;
  file: StoredFile | null;
} {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const titolo = asText(raw.titolo).trim();
  if (!titolo) throw new Error("Indica il nome del brevetto.");
  const action = asText(raw.fileAction);
  const fileAction: FileAction = action === "clear" || action === "replace" ? action : "keep";
  return {
    id: Number.isInteger(Number(raw.id)) && Number(raw.id) > 0 ? Number(raw.id) : null,
    titolo: titolo.slice(0, 120),
    ente: asText(raw.ente).trim().slice(0, 80),
    livello: asText(raw.livello).trim().slice(0, 80),
    numero: asText(raw.numero).trim().slice(0, 80),
    rilascio: readDay(raw.rilascio, "rilascio"),
    scadenza: readDay(raw.scadenza, "scadenza"),
    note: asText(raw.note).trim().slice(0, 1000),
    profondita: metriBrevetto(raw.profondita),
    fileAction,
    file: fileAction === "replace" ? readClosedFile(raw.file) : null,
  };
}

function readPezzo(input: unknown): {
  id: number | null;
  nome: string;
  marca: string;
  matricola: string;
  collaudo: string;
  scadenza: string;
  note: string;
} {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const nome = asText(raw.nome).trim();
  if (!nome) throw new Error("Indica il nome del pezzo.");
  return {
    id: Number.isInteger(Number(raw.id)) && Number(raw.id) > 0 ? Number(raw.id) : null,
    nome: nome.slice(0, 120),
    marca: asText(raw.marca).trim().slice(0, 80),
    matricola: asText(raw.matricola).trim().slice(0, 80),
    collaudo: readDay(raw.collaudo, "collaudo"),
    scadenza: readDay(raw.scadenza, "scadenza"),
    note: asText(raw.note).trim().slice(0, 1000),
  };
}

function dayOrEmpty(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export const listBrevetti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Brevetto[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{
      id: number;
      titolo: string;
      ente: string;
      livello: string;
      numero: string;
      rilascio: string | null;
      scadenza: string | null;
      note: string;
      profondita_m: string;
      file_name: string;
      file_type: string;
      has_file: boolean | string;
    }>`
      select id, titolo, ente, livello, numero, rilascio::text as rilascio, scadenza::text as scadenza,
             note, profondita_m, file_name, file_type, (file_data <> '') as has_file
      from brevetti
      where user_id = ${context.userId}
      order by scadenza nulls last, titolo
      limit 200
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      titolo: row.titolo,
      ente: row.ente,
      livello: row.livello,
      numero: row.numero,
      rilascio: dayOrEmpty(row.rilascio),
      scadenza: dayOrEmpty(row.scadenza),
      note: row.note,
      profondita: row.profondita_m ?? "",
      fileName: row.file_name,
      fileType: row.file_type,
      hasFile: asFlag(row.has_file),
    }));
  });

export const getBrevettoFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Brevetto non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<StoredFile> => {
    const sql = await getSql();
    const rows = await sql<{ file_name: string; file_type: string; file_data: string }>`
      select file_name, file_type, file_data
      from brevetti
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row?.file_data) throw new Error("Nessun documento allegato.");
    return { name: row.file_name, type: row.file_type, data: row.file_data };
  });

export const saveBrevetto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readBrevetto(input))
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rilascio = data.rilascio || null;
    const scadenza = data.scadenza || null;
    if (data.id) {
      const owned = await sql<{ id: number }>`
        select id from brevetti where id = ${data.id} and user_id = ${context.userId}
      `;
      if (!owned[0]) throw new Error("Questo brevetto non è tuo.");
      await sql`
        update brevetti
        set titolo = ${data.titolo}, ente = ${data.ente}, livello = ${data.livello}, numero = ${data.numero},
            rilascio = ${rilascio}, scadenza = ${scadenza}, note = ${data.note}, profondita_m = ${data.profondita}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}
      `;
      if (data.fileAction === "clear") {
        await sql`
          update brevetti set file_name = '', file_type = '', file_data = ''
          where id = ${data.id} and user_id = ${context.userId}
        `;
      } else if (data.fileAction === "replace" && data.file) {
        await sql`
          update brevetti
          set file_name = ${data.file.name}, file_type = ${data.file.type}, file_data = ${data.file.data}
          where id = ${data.id} and user_id = ${context.userId}
        `;
      }
      return { id: data.id };
    }
    const file = data.fileAction === "replace" && data.file ? data.file : { name: "", type: "", data: "" };
    const inserted = await sql<{ id: number }>`
      insert into brevetti (
        user_id, titolo, ente, livello, numero, rilascio, scadenza, note, profondita_m, file_name, file_type, file_data
      ) values (
        ${context.userId}, ${data.titolo}, ${data.ente}, ${data.livello}, ${data.numero},
        ${rilascio}, ${scadenza}, ${data.note}, ${data.profondita}, ${file.name}, ${file.type}, ${file.data}
      )
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const deleteBrevetto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Brevetto non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from brevetti where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Questo brevetto non è tuo.");
    return { ok: true };
  });

export const listKit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Pezzo[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{
      id: number;
      nome: string;
      marca: string;
      matricola: string;
      collaudo: string | null;
      scadenza: string | null;
      note: string;
    }>`
      select id, nome, marca, matricola, collaudo::text as collaudo, scadenza::text as scadenza, note
      from kit_personale
      where user_id = ${context.userId}
      order by scadenza nulls last, nome
      limit 200
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      marca: row.marca,
      matricola: row.matricola,
      collaudo: dayOrEmpty(row.collaudo),
      scadenza: dayOrEmpty(row.scadenza),
      note: row.note,
    }));
  });

export const saveKit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readPezzo(input))
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const collaudo = data.collaudo || null;
    const scadenza = data.scadenza || null;
    if (data.id) {
      const owned = await sql<{ id: number }>`
        select id from kit_personale where id = ${data.id} and user_id = ${context.userId}
      `;
      if (!owned[0]) throw new Error("Questo pezzo non è tuo.");
      await sql`
        update kit_personale
        set nome = ${data.nome}, marca = ${data.marca}, matricola = ${data.matricola},
            collaudo = ${collaudo}, scadenza = ${scadenza}, note = ${data.note}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}
      `;
      return { id: data.id };
    }
    const inserted = await sql<{ id: number }>`
      insert into kit_personale (user_id, nome, marca, matricola, collaudo, scadenza, note)
      values (${context.userId}, ${data.nome}, ${data.marca}, ${data.matricola}, ${collaudo}, ${scadenza}, ${data.note})
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const deleteKit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Pezzo non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from kit_personale where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Questo pezzo non è tuo.");
    return { ok: true };
  });

export type DocumentoKind = "medico" | "assicurazione";

export type Documento = {
  id: number;
  kind: DocumentoKind;
  titolo: string;
  soggetto: string;
  numero: string;
  rilascio: string;
  scadenza: string;
  note: string;
  fileName: string;
  fileType: string;
  hasFile: boolean;
};

function readDocumento(input: unknown): {
  id: number | null;
  kind: DocumentoKind;
  titolo: string;
  soggetto: string;
  numero: string;
  rilascio: string;
  scadenza: string;
  note: string;
  fileAction: FileAction;
  file: StoredFile | null;
} {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind = asText(raw.kind);
  if (kind !== "medico" && kind !== "assicurazione") throw new Error("Documento non valido.");
  const titolo = asText(raw.titolo).trim();
  if (!titolo) throw new Error(kind === "medico" ? "Indica il tipo di certificato." : "Indica la polizza.");
  const action = asText(raw.fileAction);
  const fileAction: FileAction = action === "clear" || action === "replace" ? action : "keep";
  return {
    id: Number.isInteger(Number(raw.id)) && Number(raw.id) > 0 ? Number(raw.id) : null,
    kind,
    titolo: titolo.slice(0, 120),
    soggetto: asText(raw.soggetto).trim().slice(0, 120),
    numero: asText(raw.numero).trim().slice(0, 80),
    rilascio: readDay(raw.rilascio, "rilascio"),
    scadenza: readDay(raw.scadenza, "scadenza"),
    note: asText(raw.note).trim().slice(0, 1000),
    fileAction,
    file: fileAction === "replace" ? readClosedFile(raw.file) : null,
  };
}

export const listDocumenti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Documento[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{
      id: number;
      kind: string;
      titolo: string;
      soggetto: string;
      numero: string;
      rilascio: string | null;
      scadenza: string | null;
      note: string;
      file_name: string;
      file_type: string;
      has_file: boolean | string;
    }>`
      select id, kind, titolo, soggetto, numero, rilascio::text as rilascio, scadenza::text as scadenza,
             note, file_name, file_type, (file_data <> '') as has_file
      from documenti_personali
      where user_id = ${context.userId}
      order by scadenza nulls last, titolo
      limit 100
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind === "assicurazione" ? "assicurazione" : "medico",
      titolo: row.titolo,
      soggetto: row.soggetto,
      numero: row.numero,
      rilascio: dayOrEmpty(row.rilascio),
      scadenza: dayOrEmpty(row.scadenza),
      note: row.note,
      fileName: row.file_name,
      fileType: row.file_type,
      hasFile: asFlag(row.has_file),
    }));
  });

export const getDocumentoFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Documento non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<StoredFile> => {
    const sql = await getSql();
    const rows = await sql<{ file_name: string; file_type: string; file_data: string }>`
      select file_name, file_type, file_data
      from documenti_personali
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row?.file_data) throw new Error("Nessun documento allegato.");
    return { name: row.file_name, type: row.file_type, data: row.file_data };
  });

export const saveDocumento = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readDocumento(input))
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rilascio = data.rilascio || null;
    const scadenza = data.scadenza || null;
    if (data.id) {
      const owned = await sql<{ id: number }>`
        select id from documenti_personali where id = ${data.id} and user_id = ${context.userId} and kind = ${data.kind}
      `;
      if (!owned[0]) throw new Error("Questo documento non è tuo.");
      await sql`
        update documenti_personali
        set titolo = ${data.titolo}, soggetto = ${data.soggetto}, numero = ${data.numero},
            rilascio = ${rilascio}, scadenza = ${scadenza}, note = ${data.note}, updated_at = now()
        where id = ${data.id} and user_id = ${context.userId}
      `;
      if (data.fileAction === "clear") {
        await sql`
          update documenti_personali set file_name = '', file_type = '', file_data = ''
          where id = ${data.id} and user_id = ${context.userId}
        `;
      } else if (data.fileAction === "replace" && data.file) {
        await sql`
          update documenti_personali
          set file_name = ${data.file.name}, file_type = ${data.file.type}, file_data = ${data.file.data}
          where id = ${data.id} and user_id = ${context.userId}
        `;
      }
      return { id: data.id };
    }
    const file = data.fileAction === "replace" && data.file ? data.file : { name: "", type: "", data: "" };
    const inserted = await sql<{ id: number }>`
      insert into documenti_personali (
        user_id, kind, titolo, soggetto, numero, rilascio, scadenza, note, file_name, file_type, file_data
      ) values (
        ${context.userId}, ${data.kind}, ${data.titolo}, ${data.soggetto}, ${data.numero},
        ${rilascio}, ${scadenza}, ${data.note}, ${file.name}, ${file.type}, ${file.data}
      )
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const deleteDocumento = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Documento non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from documenti_personali where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Questo documento non è tuo.");
    return { ok: true };
  });

export type ToolFile = {
  id: number;
  titolo: string;
  fileName: string;
  fileType: string;
};

export type CheckVoce = {
  id: number;
  label: string;
  done: boolean;
};

const CHECKLIST_BASE = [
  "Maschera",
  "Boccaglio",
  "Pinne",
  "Muta",
  "Sottomuta",
  "Cappuccio",
  "Guanti",
  "Calzari",
  "GAV",
  "Erogatore",
  "Octopus",
  "Manometro",
  "Fruste",
  "Computer",
  "Zavorra",
  "Bombola",
  "Torcia",
  "Boa segnasub",
  "Mulinello e cima",
  "Coltello o cutter",
  "Lavagnetta",
  "Borsa attrezzatura",
  "Documento e brevetto",
];

async function ensureChecklist(sql: Sql, userId: string): Promise<void> {
  const existing = await sql<{ id: number }>`select id from checklist_voci where user_id = ${userId} limit 1`;
  if (existing[0]) return;
  let position = 1;
  for (const label of CHECKLIST_BASE) {
    await sql`
      insert into checklist_voci (user_id, label, position)
      values (${userId}, ${label}, ${position})
    `;
    position += 1;
  }
}

function mapChecks(
  rows: { id: number; label: string; done: boolean | string }[],
): CheckVoce[] {
  return rows.map((row) => ({
    id: Number(row.id),
    label: row.label,
    done: asFlag(row.done),
  }));
}

export const listTools = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ToolFile[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const rows = await sql<{ id: number; titolo: string; file_name: string; file_type: string }>`
      select id, titolo, file_name, file_type
      from tool_files
      where user_id = ${context.userId}
      order by created_at desc, id desc
      limit 100
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      titolo: row.titolo,
      fileName: row.file_name,
      fileType: row.file_type,
    }));
  });

export const getToolFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("File non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<StoredFile> => {
    const sql = await getSql();
    const rows = await sql<{ file_name: string; file_type: string; file_data: string }>`
      select file_name, file_type, file_data
      from tool_files
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row?.file_data) throw new Error("File non trovato.");
    return { name: row.file_name, type: row.file_type, data: row.file_data };
  });

export const saveTool = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const file = readStoredFile(raw.file);
    const titolo = asText(raw.titolo).trim().slice(0, 120) || file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Documento";
    return { titolo, file };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const inserted = await sql<{ id: number }>`
      insert into tool_files (user_id, titolo, file_name, file_type, file_data)
      values (${context.userId}, ${data.titolo}, ${data.file.name}, ${data.file.type}, ${data.file.data})
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("File non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from tool_files where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Questo file non è tuo.");
    return { ok: true };
  });

export const listChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CheckVoce[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await requirePro(sql, context.userId);
    await ensureChecklist(sql, context.userId);
    const rows = await sql<{ id: number; label: string; done: boolean | string }>`
      select id, label, done
      from checklist_voci
      where user_id = ${context.userId}
      order by position, id
    `;
    return mapChecks(rows);
  });

export const saveChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const label = asText(raw.label).trim().slice(0, 80);
    if (!label) throw new Error("Scrivi la voce.");
    const id = Number(raw.id);
    return { id: Number.isInteger(id) && id > 0 ? id : null, label };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (data.id) {
      const rows = await sql<{ id: number }>`
        update checklist_voci set label = ${data.label}
        where id = ${data.id} and user_id = ${context.userId}
        returning id
      `;
      if (!rows[0]) throw new Error("Voce non trovata.");
      return { id: data.id };
    }
    const max = await sql<{ n: number }>`
      select coalesce(max(position), 0)::int as n from checklist_voci where user_id = ${context.userId}
    `;
    const inserted = await sql<{ id: number }>`
      insert into checklist_voci (user_id, label, position)
      values (${context.userId}, ${data.label}, ${Number(max[0]?.n ?? 0) + 1})
      returning id
    `;
    return { id: Number(inserted[0]?.id) };
  });

export const toggleChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Voce non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const rows = await sql<{ id: number }>`
      update checklist_voci set done = not done
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Voce non trovata.");
    return { ok: true };
  });

export const deleteChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Voce non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const rows = await sql<{ id: number }>`
      delete from checklist_voci where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows[0]) throw new Error("Voce non trovata.");
    return { ok: true };
  });

export const clearChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePro(sql, context.userId);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    await sql`update checklist_voci set done = false where user_id = ${context.userId}`;
    return { ok: true };
  });

export const listScadenze = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ScadenzaPersonale[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return [];
    const cards = await sql<{ id: number; titolo: string; scadenza: string }>`
      select id, titolo, scadenza::text as scadenza
      from brevetti
      where user_id = ${context.userId} and scadenza is not null
    `;
    const gear = await sql<{ id: number; nome: string; scadenza: string }>`
      select id, nome, scadenza::text as scadenza
      from kit_personale
      where user_id = ${context.userId} and scadenza is not null
    `;
    const papers = await sql<{ id: number; kind: string; titolo: string; scadenza: string }>`
      select id, kind, titolo, scadenza::text as scadenza
      from documenti_personali
      where user_id = ${context.userId} and scadenza is not null
    `;
    const items: ScadenzaPersonale[] = [
      ...cards.map((row) => ({
        kind: "brevetto" as const,
        id: Number(row.id),
        titolo: row.titolo,
        scadenza: row.scadenza.slice(0, 10),
      })),
      ...gear.map((row) => ({
        kind: "attrezzo" as const,
        id: Number(row.id),
        titolo: row.nome,
        scadenza: row.scadenza.slice(0, 10),
      })),
      ...papers.map((row) => ({
        kind: row.kind === "assicurazione" ? ("assicurazione" as const) : ("medico" as const),
        id: Number(row.id),
        titolo: row.titolo,
        scadenza: row.scadenza.slice(0, 10),
      })),
      ...(await scadenzeSoci(sql, context.userId)),
    ];
    const oggi = new Date();
    const entro = items.filter((item) => {
      const end = new Date(`${item.scadenza}T12:00:00`).getTime();
      const days = Math.round((end - oggi.getTime()) / 86400000);
      return days <= 30;
    });
    if (entro.length) {
      const chiave = entro
        .map((item) => `${item.kind}:${item.id}:${item.scadenza}`)
        .sort()
        .join("|");
      const seen = await sql<{ n: number }>`
        select count(*)::int as n from avvisi_push where user_id = ${context.userId} and chiave = ${chiave}
      `;
      if (Number(seen[0]?.n ?? 0) === 0) {
        const primo = entro[0];
        const body =
          entro.length === 1
            ? `${primo.titolo} scade il ${primo.scadenza.split("-").reverse().join("/")}.`
            : `${entro.length} scadenze, tra cui ${primo.titolo}.`;
        await pushUsers(sql, [context.userId], "Scadenza", body, "/personale");
        await sql`
          insert into avvisi_push (user_id, chiave) values (${context.userId}, ${chiave})
          on conflict do nothing
        `;
      }
    }
    return items;
  });

export type Allievo = {
  userId: string;
  nome: string;
  cognome: string;
  telefono: string;
};

export const listAllievi = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Allievo[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const rows = await sql<{ user_id: string; nome: string; cognome: string; telefono: string }>`
      select distinct p.user_id, p.nome, p.cognome, p.telefono
      from submissions s
      join profiles p on p.user_id = s.user_id
      where s.club_id = ${profile.clubId} and s.status = 'inviato' and p.role = 'subacqueo'
      order by p.cognome, p.nome
    `;
    return rows.map((row) => ({
      userId: row.user_id,
      nome: row.nome,
      cognome: row.cognome,
      telefono: row.telefono,
    }));
  });

export type ScuolaAffiliata = {
  id: number;
  nome: string;
  sede: string;
  email: string;
  telefono: string;
  stato: "attiva" | "sospesa";
  allievi: number;
  schede: number;
  staff: number;
  creato: string;
  hasLogo: boolean;
  senzaTitolare: boolean;
  mezzoNautico: boolean;
  postiExtra: number;
  postiLimite: number | null;
};

export type DivingScelta = {
  id: number;
  nome: string;
  sede: string;
  hasLogo: boolean;
  chiavePubblica: string;
};

export const listDivingScelte = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async (): Promise<DivingScelta[]> => {
    const sql = await getSql();
    const oggi = todayRome();
    const rows = await sql.query<{ id: number; nome: string; sede: string; has_logo: boolean | string | null; chiave_pubblica: string }>(
      `select c.id, c.nome, c.sede, (c.logo_data is not null and c.logo_data <> '') as has_logo, c.chiave_pubblica
       from club c
       where c.stato = 'attiva'
         and c.accetta_moduli
         and (
           exists (
             select 1 from profiles g
             where g.role = 'piattaforma'
               and (g.user_id = c.owner_user_id or g.user_id = c.co_owner_user_id)
           )
           or c.piano = 'active'
           or ($1::date <= $2::date and c.piano = 'trial' and c.prova_fino is not null and c.prova_fino >= $1::date)
         )
       order by c.nome, c.id`,
      [oggi, FINE_PROVA],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      sede: row.sede,
      hasLogo: asBool(row.has_logo),
      chiavePubblica: row.chiave_pubblica ?? "",
    }));
  });

export type DivingTrovato = {
  id: number;
  nome: string;
  sede: string;
  citta: string;
  provincia: string;
  email: string;
  telefono: string;
  sito: string;
  hasLogo: boolean;
};

export const listaDivingNautici = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async (): Promise<DivingTrovato[]> => {
    const sql = await getSql();
    const oggi = todayRome();
    const rows = await sql.query<{
      id: number;
      nome: string;
      sede: string;
      citta: string;
      provincia: string;
      email: string;
      telefono: string;
      sito: string;
      has_logo: boolean | string | null;
    }>(
      `select c.id, c.nome, c.sede, c.citta, c.provincia, c.email, c.telefono, c.sito,
              (c.logo_data is not null and c.logo_data <> '') as has_logo
       from club c
       where c.stato = 'attiva'
         and c.mezzo_nautico
         and c.accetta_moduli
         and (
           exists (
             select 1 from profiles g
             where g.role = 'piattaforma'
               and (g.user_id = c.owner_user_id or g.user_id = c.co_owner_user_id)
           )
           or c.piano = 'active'
           or ($1::date <= $2::date and c.piano = 'trial' and c.prova_fino is not null and c.prova_fino >= $1::date)
         )
       order by c.nome, c.id`,
      [oggi, FINE_PROVA],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      sede: row.sede ?? "",
      citta: row.citta ?? "",
      provincia: row.provincia ?? "",
      email: row.email ?? "",
      telefono: row.telefono ?? "",
      sito: row.sito ?? "",
      hasLogo: asBool(row.has_logo),
    }));
  });

export const getClubLogo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const id = Number((input as { id?: unknown }).id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    return { id };
  })
  .handler(async ({ data }): Promise<string | null> => {
    const sql = await getSql();
    const rows = await sql<{ logo_data: string | null }>`
      select logo_data from club where id = ${data.id} limit 1
    `;
    const dataUrl = rows[0]?.logo_data ?? "";
    return dataUrl.startsWith("data:image/") ? dataUrl : null;
  });

export const setClubLogo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const logo = asText((input as { logo?: unknown }).logo).trim();
    const jpeg = logo.startsWith("data:image/jpeg;base64,");
    const png = logo.startsWith("data:image/png;base64,");
    if (logo && ((!jpeg && !png) || logo.length > 160_000)) {
      throw new Error("Il logo è troppo grande. Riprova con un'immagine più piccola.");
    }
    return { logo };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const club = await requireOwner(sql, context.userId);
    await sql`update club set logo_data = ${data.logo || null} where id = ${club.id}`;
    return pack(sql, context.userId);
  });

export type PersonaScuola = Allievo & { titolare: boolean };

export const listaPersoneScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PersonaScuola[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    if (!profile.clubId) throw new Error("Questa utenza non è collegata a una scuola.");
    const rows = await sql<{ user_id: string; nome: string; cognome: string; telefono: string; titolare: boolean | string | null }>`
      select p.user_id, p.nome, p.cognome, p.telefono,
        (p.user_id = c.owner_user_id or p.user_id = c.co_owner_user_id) as titolare
      from profiles p
      join club c on c.id = ${profile.clubId}
      where p.user_id = c.owner_user_id
         or p.user_id = c.co_owner_user_id
         or exists (select 1 from staff_membri m where m.club_id = c.id and m.user_id = p.user_id)
      order by titolare desc, p.cognome, p.nome
    `;
    return rows.map((row) => ({
      userId: row.user_id,
      nome: row.nome,
      cognome: row.cognome,
      telefono: row.telefono,
      titolare: asBool(row.titolare),
    }));
  });

export type ReportSub = {
  cognome: string;
  nome: string;
  allievo: boolean;
  didattica: string;
  livello: string;
  numero: string;
  profonditaBrevetto: string;
  autorespiratore: string;
  miscela: string;
  profondita: string;
  orarioFine: string;
};

export type ReportUscita = {
  data: string;
  localita: string;
  punto: string;
  orarioInizio: string;
  gruppi: { guida: string; passaggio: boolean; persone: ReportSub[] }[];
};

export type ReportStaff = {
  cognome: string;
  nome: string;
  titolare: boolean;
  brevetto: "ok" | "assente" | "scaduto";
  medico: "ok" | "assente" | "scaduto";
  assicurazione: "ok" | "assente" | "scaduto";
  brevettoScadenza: string;
  medicoScadenza: string;
  assicurazioneScadenza: string;
};

export type ReportControlli = {
  centro: string;
  dal: string;
  al: string;
  oggi: string;
  uscite: ReportUscita[];
  staff: ReportStaff[];
};

function ultimaScadenza(rows: { scadenza: string | null }[]): string {
  const dates = rows.map((row) => (row.scadenza ?? "").slice(0, 10)).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  return dates.sort().at(-1) ?? "";
}

function oraCorta(value: string): string {
  const ora = value.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(ora) ? ora : "";
}

export const reportControlli = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const dal = String(raw.dal ?? "").slice(0, 10);
    const al = String(raw.al ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || al < dal) {
      throw new Error("Periodo non valido.");
    }
    return { dal, al };
  })
  .handler(async ({ context, data }): Promise<ReportControlli> => {
    const sql = await getSql();
    const club = await requireOwner(sql, context.userId);
    const oggi = todayRome();
    const uscite = await sql<{
      id: number;
      data: string;
      localita: string;
      punto: string;
      orario_inizio: string;
      guida_nome: string;
    }>`
      select id, data::text as data, localita, punto, orario_inizio, guida_nome
      from uscite
      where club_id = ${club.id} and data >= ${data.dal}::date and data <= ${data.al}::date
      order by data, id
    `;
    const ids = uscite.map((row) => Number(row.id));
    const gruppiRows = ids.length
      ? await sql.query<{
          id: number;
          uscita_id: number;
          guida_nome: string;
          passaggio: boolean;
        }>(
          `select id, uscita_id, guida_nome, passaggio
           from uscita_gruppi where uscita_id = any($1::int[]) order by id`,
          [ids],
        )
      : [];
    const righeRows = ids.length
      ? await sql.query<{
          id: number;
          uscita_id: number;
          gruppo_id: number | null;
          user_id: string | null;
          cognome: string;
          nome: string;
          didattica: string;
          livello: string;
          numero_brevetto: string;
          allievo: boolean;
          orario_fine: string;
          profondita: string;
          autorespiratore: string;
          miscela: string;
          percentuale_o2: string;
        }>(
          `select id, uscita_id, gruppo_id, user_id, cognome, nome, didattica, livello, numero_brevetto, allievo,
                  orario_fine, profondita, autorespiratore, miscela, percentuale_o2
           from uscita_righe where uscita_id = any($1::int[]) order by cognome, nome, id`,
          [ids],
        )
      : [];
    const userIds = [...new Set(righeRows.flatMap((row) => (row.user_id ? [row.user_id] : [])))];
    const schede = userIds.length
      ? await sql.query<{ user_id: string; payload: unknown; dive_date: string | null }>(
          `select user_id, payload, dive_date::text as dive_date
           from submissions
           where club_id = $1 and status = 'inviato' and form_key = 'registro-immersione' and user_id = any($2::text[])
           order by user_id, created_at desc, id desc`,
          [club.id, userIds],
        )
      : [];
    const schedeDi = new Map<string, { payload: unknown; dive_date: string | null }[]>();
    for (const scheda of schede) {
      const lista = schedeDi.get(scheda.user_id);
      if (lista) lista.push(scheda);
      else schedeDi.set(scheda.user_id, [scheda]);
    }
    const profonditaDi = (userId: string | null, giorno: string) => {
      if (!userId) return "";
      const scheda = (schedeDi.get(userId) ?? []).find((item) => schedaCopreGiorno(item.payload, item.dive_date, giorno));
      if (!scheda) return "";
      const metri = metriIndicati(testoCampo(oggettoPayload(scheda.payload), "profondita_massima"));
      if (metri == null) return "";
      return Number.isInteger(metri) ? String(metri) : String(metri);
    };
    const persona = (row: (typeof righeRows)[number], giorno: string): ReportSub => {
      const miscela = [row.miscela, row.percentuale_o2 ? `O2 ${row.percentuale_o2}%` : ""].filter(Boolean).join(" · ");
      return {
        cognome: row.cognome,
        nome: row.nome,
        allievo: Boolean(row.allievo),
        didattica: row.didattica,
        livello: row.livello,
        numero: row.numero_brevetto,
        profonditaBrevetto: profonditaDi(row.user_id, giorno),
        autorespiratore: row.autorespiratore,
        miscela,
        profondita: row.profondita,
        orarioFine: oraCorta(row.orario_fine),
      };
    };
    const reportUscite: ReportUscita[] = uscite.map((uscita) => {
      const giorno = uscita.data.slice(0, 10);
      const gruppi = gruppiRows.filter((gruppo) => Number(gruppo.uscita_id) === Number(uscita.id));
      const righe = righeRows.filter((riga) => Number(riga.uscita_id) === Number(uscita.id));
      const assegnate = new Set<number>();
      const voci = gruppi.map((gruppo) => {
        const sue = righe.filter((riga) => Number(riga.gruppo_id) === Number(gruppo.id));
        for (const riga of sue) assegnate.add(Number(riga.id));
        return {
          guida: gruppo.guida_nome || (gruppo.passaggio ? "" : uscita.guida_nome),
          passaggio: Boolean(gruppo.passaggio),
          persone: sue.map((riga) => persona(riga, giorno)),
        };
      });
      const orfane = righe.filter((riga) => !assegnate.has(Number(riga.id))).map((riga) => persona(riga, giorno));
      if (orfane.length) {
        if (voci[0]) voci[0].persone.push(...orfane);
        else voci.push({ guida: uscita.guida_nome, passaggio: !uscita.guida_nome, persone: orfane });
      } else if (!voci.length) {
        voci.push({ guida: uscita.guida_nome, passaggio: !uscita.guida_nome, persone: [] });
      }
      return {
        data: giorno,
        localita: uscita.localita,
        punto: uscita.punto,
        orarioInizio: oraCorta(uscita.orario_inizio),
        gruppi: voci,
      };
    });
    const persone = await sql<{ user_id: string; nome: string; cognome: string; titolare: boolean | string | null }>`
      select p.user_id, p.nome, p.cognome,
        (p.user_id = c.owner_user_id or p.user_id = c.co_owner_user_id) as titolare
      from profiles p
      join club c on c.id = ${club.id}
      where p.user_id = c.owner_user_id
         or p.user_id = c.co_owner_user_id
         or exists (select 1 from staff_membri m where m.club_id = c.id and m.user_id = p.user_id)
      order by titolare desc, p.cognome, p.nome
    `;
    const staffIds = persone.map((person) => person.user_id).filter(Boolean);
    const docs = staffIds.length
      ? await sql.query<DocRow>(
          `select user_id, kind, scadenza::text as scadenza
           from documenti_personali
           where kind in ('medico', 'assicurazione') and user_id = any($1::text[])`,
          [staffIds],
        )
      : [];
    const brevetti = staffIds.length
      ? await sql.query<{ user_id: string; scadenza: string | null }>(
          `select user_id, scadenza::text as scadenza from brevetti where user_id = any($1::text[])`,
          [staffIds],
        )
      : [];
    const staff: ReportStaff[] = persone.map((person) => {
      const suoiDoc = (kind: string) => docs.filter((row) => row.user_id === person.user_id && row.kind === kind);
      const sueCarte = brevetti.filter((row) => row.user_id === person.user_id);
      const medico = suoiDoc("medico");
      const polizza = suoiDoc("assicurazione");
      return {
        cognome: person.cognome,
        nome: person.nome,
        titolare: asBool(person.titolare),
        brevetto: statoCaricato(sueCarte, oggi),
        medico: statoCaricato(medico, oggi),
        assicurazione: statoCaricato(polizza, oggi),
        brevettoScadenza: ultimaScadenza(sueCarte),
        medicoScadenza: ultimaScadenza(medico),
        assicurazioneScadenza: ultimaScadenza(polizza),
      };
    });
    return { centro: club.nome, dal: data.dal, al: data.al, oggi, uscite: reportUscite, staff };
  });

export type StatoStaffHome = {
  userId: string;
  problemi: string[];
  medico: (string | null)[];
  assicurazione: (string | null)[];
  brevetto: (string | null)[];
};

export const statoDocumentiStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<StatoStaffHome[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const club = profile.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!club) throw new Error("Questa utenza non è collegata a una scuola.");
    const people = await sql<{ user_id: string }>`
      select p.user_id
      from profiles p
      where p.user_id = ${club.owner_user_id}
         or p.user_id = ${club.co_owner_user_id}
         or exists (select 1 from staff_membri m where m.club_id = ${club.id} and m.user_id = p.user_id)
    `;
    const ids = people.map((person) => person.user_id).filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const docs = await sql.query<DocRow>(
      `select user_id, kind, scadenza::text as scadenza
       from documenti_personali
       where kind in ('medico', 'assicurazione') and user_id in (${placeholders})`,
      ids,
    );
    const brevetti = await sql.query<{ user_id: string; scadenza: string | null }>(
      `select user_id, scadenza::text as scadenza from brevetti where user_id in (${placeholders})`,
      ids,
    );
    const oggi = todayRome();
    return people.map((person) => {
      const suoi = (row: { user_id: string }) => row.user_id === person.user_id;
      const medico = elencoScadenze(docs.filter((row) => suoi(row) && row.kind === "medico"));
      const assicurazione = elencoScadenze(docs.filter((row) => suoi(row) && row.kind === "assicurazione"));
      const brevetto = elencoScadenze(brevetti.filter(suoi));
      const documenti = { medico, assicurazione, brevetto };
      return {
        userId: person.user_id,
        medico,
        assicurazione,
        brevetto,
        problemi: problemiDocumenti(documenti, oggi),
      };
    });
  });

export const listStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Allievo[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    if (!profile.clubId) throw new Error("Questa utenza non è collegata a una scuola.");
    const rows = await sql<{ user_id: string; nome: string; cognome: string; telefono: string }>`
      select p.user_id, p.nome, p.cognome, p.telefono
      from staff_membri m
      join profiles p on p.user_id = m.user_id
      where m.club_id = ${profile.clubId}
      order by p.cognome, p.nome
    `;
    return rows.map((row) => ({
      userId: row.user_id,
      nome: row.nome,
      cognome: row.cognome,
      telefono: row.telefono,
    }));
  });

export type CopiaGestore = {
  esportatoIl: string;
  conteggi: {
    account: number;
    diving: number;
    staff: number;
    collegamenti: number;
    moduli: number;
    moduliInviati: number;
  };
  account: {
    id: string;
    email: string;
    emailVerificata: boolean;
    creato: string;
    nome: string;
    cognome: string;
    telefono: string;
    ruolo: string;
    clubId: number | null;
  }[];
  diving: { [key: string]: string | number | boolean | null }[];
  staff: { userId: string; clubId: number | null }[];
  collegamenti: { tipo: string; userId: string; clubId: number | null; dettaglio: string }[];
  moduli: { [key: string]: string | number | boolean | null }[];
};

const NASCONDI_COPIA = new Set(["password", "token", "accessToken", "refreshToken", "idToken"]);

function citaTabella(table: string) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Tabella non prevista.");
  return `"${table}"`;
}

async function leggiTabella(
  sql: Sql,
  table: string,
  nascondi: Set<string> = NASCONDI_COPIA,
): Promise<{ [key: string]: string | number | boolean | null }[]> {
  const nome = `public.${citaTabella(table)}`;
  const found = await sql<{ ok: string | null }>`select to_regclass(${nome}) as ok`;
  if (!found[0]?.ok) return [];
  const rows = await sql.query<{ r: { [key: string]: unknown } | null }>(`select to_jsonb(t) as r from ${citaTabella(table)} t`);
  return rows.map((row) => {
    const value = { ...(row.r ?? {}) };
    for (const key of nascondi) delete value[key];
    const piano: { [key: string]: string | number | boolean | null } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item == null) piano[key] = null;
      else if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") piano[key] = item;
      else piano[key] = JSON.stringify(item);
    }
    return piano;
  });
}

function testoCopia(value: unknown) {
  return value == null ? "" : String(value);
}

export const scaricaCopiaGestore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CopiaGestore> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const [utenti, profili, diving, staff, affiliazioni, moduli] = await Promise.all([
      leggiTabella(sql, "user"),
      leggiTabella(sql, "profiles"),
      leggiTabella(sql, "club"),
      leggiTabella(sql, "staff_membri"),
      leggiTabella(sql, "affiliazioni"),
      leggiTabella(sql, "submissions"),
    ]);
    const profiloDi = new Map(profili.map((row) => [testoCopia(row.user_id), row]));
    const visti = new Set(utenti.map((row) => testoCopia(row.id)));
    const account = utenti.map((row) => {
      const profilo = profiloDi.get(testoCopia(row.id));
      return {
        id: testoCopia(row.id),
        email: testoCopia(row.email),
        emailVerificata: row.emailVerified === true,
        creato: testoCopia(row.createdAt),
        nome: testoCopia(profilo?.nome),
        cognome: testoCopia(profilo?.cognome),
        telefono: testoCopia(profilo?.telefono),
        ruolo: testoCopia(profilo?.role),
        clubId: profilo?.club_id == null || profilo.club_id === "" ? null : Number(profilo.club_id) || null,
      };
    });
    for (const profilo of profili) {
      const id = testoCopia(profilo.user_id);
      if (!id || visti.has(id)) continue;
      account.push({
        id,
        email: "",
        emailVerificata: false,
        creato: testoCopia(profilo.created_at),
        nome: testoCopia(profilo.nome),
        cognome: testoCopia(profilo.cognome),
        telefono: testoCopia(profilo.telefono),
        ruolo: testoCopia(profilo.role),
        clubId: profilo.club_id == null || profilo.club_id === "" ? null : Number(profilo.club_id) || null,
      });
    }
    const collegamenti: CopiaGestore["collegamenti"] = [];
    for (const row of staff) {
      collegamenti.push({
        tipo: "staff",
        userId: testoCopia(row.user_id),
        clubId: Number(row.club_id) || null,
        dettaglio: "",
      });
    }
    for (const row of diving) {
      const clubId = Number(row.id) || null;
      if (row.owner_user_id) {
        collegamenti.push({ tipo: "titolare", userId: testoCopia(row.owner_user_id), clubId, dettaglio: testoCopia(row.nome) });
      }
      if (row.co_owner_user_id) {
        collegamenti.push({ tipo: "secondo-titolare", userId: testoCopia(row.co_owner_user_id), clubId, dettaglio: testoCopia(row.nome) });
      }
    }
    for (const row of profili) {
      if (row.club_id == null || row.club_id === "") continue;
      collegamenti.push({
        tipo: "profilo",
        userId: testoCopia(row.user_id),
        clubId: Number(row.club_id) || null,
        dettaglio: testoCopia(row.role),
      });
    }
    for (const row of affiliazioni) {
      collegamenti.push({
        tipo: "affiliazione",
        userId: testoCopia(row.user_id),
        clubId: null,
        dettaglio: `${testoCopia(row.stato)} ${testoCopia(row.diving_nome)}`.trim(),
      });
    }
    const moduliInviati = moduli.filter((row) => row.status === "inviato").length;
    return {
      esportatoIl: new Date().toISOString(),
      conteggi: {
        account: account.length,
        diving: diving.length,
        staff: staff.length,
        collegamenti: collegamenti.length,
        moduli: moduli.length,
        moduliInviati,
      },
      account,
      diving,
      staff: staff.map((row) => ({ userId: testoCopia(row.user_id), clubId: Number(row.club_id) || null })),
      collegamenti,
      moduli,
    };
  });

const TABELLE_DATABASE = [
  "user",
  "account",
  "profiles",
  "club",
  "submissions",
  "notifications",
  "notification_reads",
  "brevetti",
  "kit_personale",
  "documenti_personali",
  "logbook_entries",
  "logbook_photos",
  "logbook_voice",
  "logbook_specie",
  "logbook_condivisioni",
  "scubadex_viste",
  "scubadex_proprie",
  "platform",
  "staff_membri",
  "affiliazioni",
  "uscite",
  "uscita_righe",
  "uscita_gruppi",
  "imbarcazioni",
  "privacy_accettazioni",
  "scheda_aperture",
  "scheda_modifiche",
  "guida_accettazioni",
  "responsabilita_accettazioni",
  "accettazioni_legali",
  "titolare_trattamento",
  "chiusure_scuola",
  "avvisi_push",
  "soci",
  "soci_attivita",
  "soci_attivita_iscrizioni",
  "soci_documenti",
  "soci_comunicazioni",
  "soci_comunicazioni_destinatari",
  "soci_comunicazioni_file",
  "tool_files",
  "checklist_voci",
] as const;

const NASCONDI_DATABASE = new Set(["accessToken", "refreshToken", "idToken", "token"]);

export type DatabaseGestore = {
  esportatoIl: string;
  conteggi: { [tabella: string]: number };
  tabelle: { [tabella: string]: { [key: string]: string | number | boolean | null }[] };
};

export const scaricaDatabaseGestore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DatabaseGestore> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const tabelle: DatabaseGestore["tabelle"] = {};
    const conteggi: DatabaseGestore["conteggi"] = {};
    for (const nome of TABELLE_DATABASE) {
      const righe = await leggiTabella(sql, nome, NASCONDI_DATABASE);
      tabelle[nome] = righe;
      conteggi[nome] = righe.length;
    }
    return { esportatoIl: new Date().toISOString(), conteggi, tabelle };
  });

function citaColonna(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Colonna non prevista.");
  return `"${name}"`;
}

type ColonnaDatabase = { name: string; dataType: string; udt: string };
type RigaDatabase = { [key: string]: string | number | boolean | null };

function rimappaTesto(value: string, mappa: Map<string, string>): string {
  const diretto = mappa.get(value);
  if (diretto) return diretto;
  const pezzo = value.trim();
  if ((pezzo.startsWith("{") || pezzo.startsWith("[")) && pezzo.length > 2) {
    try {
      return JSON.stringify(rimappaJson(JSON.parse(pezzo), mappa));
    } catch {
      return value;
    }
  }
  return value;
}

function rimappaJson(value: unknown, mappa: Map<string, string>): unknown {
  if (typeof value === "string") return rimappaTesto(value, mappa);
  if (Array.isArray(value)) return value.map((item) => rimappaJson(item, mappa));
  if (value && typeof value === "object") {
    const out: { [key: string]: unknown } = {};
    for (const [key, item] of Object.entries(value)) out[key] = rimappaJson(item, mappa);
    return out;
  }
  return value;
}

function rimappaRiga(row: RigaDatabase, mappa: Map<string, string>): RigaDatabase {
  const out: RigaDatabase = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "string" ? rimappaTesto(value, mappa) : value;
  }
  return out;
}

async function colonneDatabase(sql: Sql, table: string): Promise<ColonnaDatabase[]> {
  const rows = await sql.query<{ column_name: string; data_type: string; udt_name: string }>(
    "select column_name, data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return rows.map((row) => ({ name: row.column_name, dataType: row.data_type, udt: row.udt_name }));
}

async function chiaveDatabase(sql: Sql, table: string): Promise<string[]> {
  const rows = await sql.query<{ name: string }>(
    `select a.attname as name
     from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = $1::regclass and i.indisprimary
     order by array_position(i.indkey, a.attnum)`,
    [`public.${citaTabella(table)}`],
  );
  return rows.map((row) => row.name);
}

function castDatabase(col: ColonnaDatabase) {
  if (col.dataType === "jsonb") return "::jsonb";
  if (col.dataType === "json") return "::json";
  if (col.dataType === "date") return "::date";
  if (col.dataType === "timestamp with time zone") return "::timestamptz";
  if (col.dataType === "timestamp without time zone") return "::timestamp";
  if (col.udt === "_text") return "::text[]";
  return "";
}

function valoreDatabase(col: ColonnaDatabase, raw: string | number | boolean | null) {
  if (typeof raw === "string" && raw.trim() === "" && castDatabase(col)) return null;
  if ((col.dataType === "jsonb" || col.dataType === "json") && raw != null && typeof raw !== "string") return JSON.stringify(raw);
  if (col.udt === "_text" && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function importaTabella(sql: Sql, table: string, righe: RigaDatabase[]) {
  if (!righe.length) return 0;
  const colonne = await colonneDatabase(sql, table);
  if (!colonne.length) return 0;
  const chiave = await chiaveDatabase(sql, table);
  const note = new Set(colonne.map((col) => col.name));
  let scritte = 0;
  for (const row of righe) {
    const usate = colonne.filter((col) => col.name in row && note.has(col.name));
    if (!usate.length) continue;
    const params = usate.map((col) => valoreDatabase(col, row[col.name] ?? null));
    const values = usate.map((col, index) => `$${index + 1}${castDatabase(col)}`).join(", ");
    const presenti = new Set(usate.map((col) => col.name));
    const pk = chiave.filter((nome) => presenti.has(nome));
    const aggiornabili = usate.filter((col) => !pk.includes(col.name));
    const conflict = pk.length
      ? aggiornabili.length
        ? ` on conflict (${pk.map(citaColonna).join(", ")}) do update set ${aggiornabili.map((col) => `${citaColonna(col.name)} = excluded.${citaColonna(col.name)}`).join(", ")}`
        : ` on conflict (${pk.map(citaColonna).join(", ")}) do nothing`
      : "";
    await sql.query(
      `insert into ${citaTabella(table)} (${usate.map((col) => citaColonna(col.name)).join(", ")}) values (${values})${conflict}`,
      params,
    );
    scritte += 1;
  }
  const seriali = await sql.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_default like 'nextval%'",
    [table],
  );
  for (const col of seriali) {
    await sql.query(
      `select setval(pg_get_serial_sequence($1, $2), greatest(coalesce((select max(${citaColonna(col.column_name)}) from ${citaTabella(table)}), 1), 1), true)`,
      [`public.${table}`, col.column_name],
    );
  }
  return scritte;
}

export const caricaDatabaseGestore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = oggettoCopia(input);
    const tabella = testoCopia(body?.tabella);
    const ammesse = new Set<string>(TABELLE_DATABASE);
    if (!body || !ammesse.has(tabella) || !Array.isArray(body.righe)) throw new Error("Questo non è il file del database completo.");
    const righe = body.righe.filter((row): row is RigaDatabase => Boolean(oggettoCopia(row)));
    const utenti = Array.isArray(body.utenti)
      ? body.utenti.filter((row): row is RigaDatabase => Boolean(oggettoCopia(row))).map((row) => ({ id: testoCopia(row.id), email: testoCopia(row.email) }))
      : [];
    return { tabella, righe, utenti };
  })
  .handler(async ({ context, data }): Promise<{ scritte: number }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const esistenti = await sql.query<{ id: string; email: string }>(`select "id", "email" from "user"`);
    const perMail = new Map(esistenti.map((row) => [row.email.trim().toLowerCase(), row.id]));
    const mappa = new Map<string, string>();
    for (const row of data.utenti) {
      const email = row.email.trim().toLowerCase();
      const gia = email ? perMail.get(email) : undefined;
      if (row.id && gia && gia !== row.id) mappa.set(row.id, gia);
    }
    const righe = data.righe
      .filter((row) => !(data.tabella === "user" && mappa.has(testoCopia(row.id))))
      .filter((row) => !(data.tabella === "account" && mappa.has(testoCopia(row.userId))))
      .map((row) => rimappaRiga(row, mappa));
    try {
      const scritte = await importaTabella(sql, data.tabella, righe);
      return { scritte };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Caricamento non riuscito.";
      throw new Error(`Caricamento fermo su ${data.tabella}. ${message}`);
    }
  });

export type ModuloMancante = {
  chiave: string;
  formKey: string;
  data: string;
  autore: string;
  soggetto: string;
};

function oggettoCopia(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function giornoCopia(value: unknown): string {
  const text = testoCopia(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function secondoCopia(value: unknown): string {
  const text = testoCopia(value).trim();
  if (!text) return "";
  const time = Date.parse(text);
  if (Number.isNaN(time)) return text.slice(0, 19);
  return new Date(time).toISOString().slice(0, 19);
}

function istanteCopia(value: unknown): string {
  const text = testoCopia(value).trim();
  if (!text) return "";
  const time = Date.parse(text);
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString();
}

function payloadJson(value: unknown): string {
  const text = payloadCopia(value);
  if (!text) return "{}";
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return "{}";
    return text;
  } catch {
    return "{}";
  }
}

function ordinaCopia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordinaCopia);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = ordinaCopia((value as Record<string, unknown>)[key]);
  }
  return out;
}

function payloadCopia(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(ordinaCopia(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  return JSON.stringify(ordinaCopia(value));
}

function firmaModulo(row: Record<string, unknown>, clubOk?: Set<number>): string {
  const club = Number(row.club_id);
  const clubNelFile = !clubOk || (Number.isInteger(club) && club > 0 && clubOk.has(club));
  return [
    testoCopia(row.form_key),
    testoCopia(row.subject_name).trim(),
    giornoCopia(row.dive_date),
    testoCopia(row.status),
    clubNelFile ? testoCopia(row.club_id) : "",
    secondoCopia(row.created_at),
    payloadCopia(row.payload),
  ].join("\u0001");
}

function leggiModuloCopia(value: unknown): Record<string, unknown> | null {
  const row = oggettoCopia(value);
  if (!row) return null;
  const formKey = testoCopia(row.form_key).trim();
  const status = testoCopia(row.status).trim();
  if (!formKey || (status !== "bozza" && status !== "inviato")) return null;
  return row;
}

async function clubPresenti(sql: Sql, moduli: unknown[]): Promise<Set<number>> {
  const ids = [...new Set(moduli.flatMap((item) => {
    const row = leggiModuloCopia(item);
    const id = Number(row?.club_id);
    return Number.isInteger(id) && id > 0 ? [id] : [];
  }))];
  if (!ids.length) return new Set();
  const trovati = await sql.query<{ id: number }>(`select id from club where id = any($1::int[])`, [ids]);
  return new Set(trovati.map((row) => Number(row.id)));
}

export const confrontaModuliUtente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = oggettoCopia(input);
    const userId = testoCopia(raw?.userId).trim();
    const origineId = testoCopia(raw?.origineId).trim();
    const moduli = Array.isArray(raw?.moduli) ? raw.moduli : null;
    if (!userId || !moduli) throw new Error("Dati mancanti.");
    if (moduli.length > 2000) throw new Error("Il file ha troppi moduli.");
    return { userId, origineId, moduli };
  })
  .handler(async ({ context, data }): Promise<ModuloMancante[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const profilo = await loadProfile(sql, data.userId);
    if (!profilo) throw new Error("Account non trovato.");
    const presenti = await sql<{
      id: number;
      user_id: string;
      form_key: string;
      subject_name: string;
      dive_date: string | null;
      status: string;
      club_id: number | null;
      created_at: string;
      payload: unknown;
    }>`
      select id, user_id, form_key, subject_name, dive_date::text as dive_date, status, club_id,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, payload
      from submissions
      where user_id = ${data.userId}
    `;
    const firme = new Set(presenti.map((row) => firmaModulo(row)));
    const idPresenti = new Set(presenti.map((row) => Number(row.id)));
    const clubOk = await clubPresenti(sql, data.moduli);
    const mancanti: ModuloMancante[] = [];
    data.moduli.forEach((item, index) => {
      const row = leggiModuloCopia(item);
      if (!row) return;
      const origine = testoCopia(row.user_id);
      if (data.origineId && origine && origine !== data.origineId) return;
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0 && idPresenti.has(id)) return;
      if (firme.has(firmaModulo(row, clubOk))) return;
      const giorno = giornoCopia(row.dive_date) || giornoCopia(row.created_at);
      mancanti.push({
        chiave: String(index),
        formKey: testoCopia(row.form_key),
        data: giorno,
        autore: testoCopia(row.author_name),
        soggetto: testoCopia(row.subject_name),
      });
    });
    return mancanti;
  });

export const ripristinaModuliUtente = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = oggettoCopia(input);
    const userId = testoCopia(raw?.userId).trim();
    const moduli = Array.isArray(raw?.moduli) ? raw.moduli : null;
    if (!userId || !moduli || !moduli.length) throw new Error("Seleziona almeno un modulo.");
    if (moduli.length > 200) throw new Error("Ripristina al massimo 200 moduli per volta.");
    return { userId, moduli };
  })
  .handler(async ({ context, data }): Promise<{ ripristinati: number }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const profilo = await loadProfile(sql, data.userId);
    if (!profilo) throw new Error("Account non trovato.");
    const presenti = await sql<{
      id: number;
      form_key: string;
      subject_name: string;
      dive_date: string | null;
      status: string;
      club_id: number | null;
      created_at: string;
      payload: unknown;
    }>`
      select id, form_key, subject_name, dive_date::text as dive_date, status, club_id,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, payload
      from submissions
      where user_id = ${data.userId}
    `;
    const firme = new Set(presenti.map((row) => firmaModulo(row)));
    const idPresenti = new Set(presenti.map((row) => Number(row.id)));
    const clubOk = await clubPresenti(sql, data.moduli);
    let ripristinati = 0;
    for (const item of data.moduli) {
      const row = leggiModuloCopia(item);
      if (!row) continue;
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0 && idPresenti.has(id)) continue;
      const firma = firmaModulo(row, clubOk);
      if (firme.has(firma)) continue;
      const clubId = Number(row.club_id);
      const destinazione = Number.isInteger(clubId) && clubOk.has(clubId) ? clubId : null;
      const autore = testoCopia(row.author_name).trim() || `${profilo.cognome} ${profilo.nome}`.trim() || "Modulo";
      const soggetto = testoCopia(row.subject_name).trim() || "Modulo";
      const creato = istanteCopia(row.created_at);
      const aggiornato = istanteCopia(row.updated_at) || creato;
      const letto = istanteCopia(row.letto_il);
      const payload = payloadJson(row.payload);
      await sql`
        insert into submissions (user_id, author_name, form_key, subject_name, dive_date, status, payload, club_id, created_at, updated_at, letto_il)
        values (
          ${data.userId},
          ${autore.slice(0, 160)},
          ${testoCopia(row.form_key).slice(0, 80)},
          ${soggetto.slice(0, 160)},
          ${giornoCopia(row.dive_date) || null},
          ${testoCopia(row.status)},
          ${payload}::jsonb,
          ${destinazione},
          coalesce(${creato || null}::timestamptz, now()),
          coalesce(${aggiornato || null}::timestamptz, now()),
          ${letto || null}::timestamptz
        )
      `;
      firme.add(firma);
      ripristinati += 1;
    }
    return { ripristinati };
  });

export type AccountGestore = {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruoloApp: string;
  ruolo: string;
  piano: string;
  provaFino: string;
  scuolaId: number | null;
  scuola: string;
  senzaProfilo: boolean;
};

export type DivingPiano = {
  id: number;
  nome: string;
  piano: string;
  provaFino: string;
  stato: string;
  mezzoNautico: boolean;
};

export const elencoAbbonamenti = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ account: AccountGestore[]; diving: DivingPiano[] }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const account = await sql<{
      id: string;
      email: string;
      nome: string | null;
      cognome: string | null;
      ruolo_app: string | null;
      ruolo: string | null;
      piano: string | null;
      prova_fino: string | null;
      scuola_id: number | null;
      scuola: string | null;
    }>`
      select u.id, u.email, p.nome, p.cognome, p.role as ruolo_app, p.ruolo, p.piano,
             p.prova_fino::text as prova_fino, p.club_id as scuola_id, c.nome as scuola
      from "user" u
      left join profiles p on p.user_id = u.id
      left join club c on c.id = p.club_id
      order by (p.ruolo is null) desc, p.cognome nulls last, u.email
    `;
    const diving = await sql<{ id: number; nome: string; piano: string | null; prova_fino: string | null; stato: string; mezzo_nautico: boolean | string | null }>`
      select id, nome, piano, prova_fino::text as prova_fino, stato, mezzo_nautico
      from club
      order by nome, id
    `;
    return {
      account: account.map((row) => ({
        id: row.id,
        email: row.email,
        nome: row.nome ?? "",
        cognome: row.cognome ?? "",
        ruoloApp: row.ruolo_app ?? "",
        ruolo: row.ruolo ?? "",
        piano: row.piano ?? "",
        provaFino: row.prova_fino ?? "",
        scuolaId: row.scuola_id == null ? null : Number(row.scuola_id),
        scuola: row.scuola ?? "",
        senzaProfilo: row.ruolo_app == null,
      })),
      diving: diving.map((row) => ({
        id: Number(row.id),
        nome: row.nome,
        piano: row.piano ?? "",
        provaFino: row.prova_fino ?? "",
        stato: row.stato,
        mezzoNautico: row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico),
      })),
    };
  });

export const scaricaDatiAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ nome: string; cognome: string; email: string; ruolo: string; registrato: string; stato: "attivo" | "trial" | "scaduto" }[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const oggi = todayRome();
    const rows = await sql<{
      email: string;
      nome: string | null;
      cognome: string | null;
      ruolo_app: string | null;
      ruolo: string | null;
      piano: string | null;
      prova_fino: string | null;
      creato: string;
      scuola_piano: string | null;
      scuola_prova: string | null;
    }>`
      select u.email, p.nome, p.cognome, p.role as ruolo_app, p.ruolo, p.piano,
             p.prova_fino::text as prova_fino,
             to_char(u."createdAt", 'YYYY-MM-DD') as creato,
             c.piano as scuola_piano, c.prova_fino::text as scuola_prova
      from "user" u
      left join profiles p on p.user_id = u.id
      left join club c on c.id = p.club_id
      order by u."createdAt", u.email
    `;
    return rows.map((row) => ({
      nome: row.nome ?? "",
      cognome: row.cognome ?? "",
      email: row.email,
      ruolo: etichettaRuoloAccount(row.ruolo_app, row.ruolo),
      registrato: (row.creato ?? "").slice(0, 10),
      stato: statoAccount({
        oggi,
        ruoloApp: row.ruolo_app ?? "",
        ruolo: row.ruolo ?? "",
        piano: row.piano ?? "",
        provaFino: (row.prova_fino ?? "").slice(0, 10),
        scuolaPiano: row.scuola_piano ?? "",
        scuolaProva: (row.scuola_prova ?? "").slice(0, 10),
      }),
    }));
  });

function etichettaRuoloAccount(ruoloApp: string | null, ruolo: string | null): string {
  if (ruoloApp === "piattaforma") return "Gestore";
  if (ruolo === "sub") return "Subacqueo";
  if (ruolo === "staff") return "Staff";
  if (ruolo === "titolare") return "Titolare";
  return "";
}

function statoAccount(input: {
  oggi: string;
  ruoloApp: string;
  ruolo: string;
  piano: string;
  provaFino: string;
  scuolaPiano: string;
  scuolaProva: string;
}): "attivo" | "trial" | "scaduto" {
  if (input.ruoloApp === "piattaforma") return "attivo";
  if (input.ruolo === "sub") {
    if (input.piano === "pro") return "attivo";
    if (input.piano === "trial" && entroProva(input.oggi, input.provaFino)) return "trial";
    return "scaduto";
  }
  if (input.ruolo === "staff" || input.ruolo === "titolare") {
    if (input.scuolaPiano === "active") return "attivo";
    if (input.scuolaPiano === "trial" && entroProva(input.oggi, input.scuolaProva)) return "trial";
    return "scaduto";
  }
  return "scaduto";
}

export const impostaAccountAbbonamento = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = asText(raw.id).trim();
    const ruolo = asText(raw.ruolo);
    const piano = asText(raw.piano);
    const provaFino = asText(raw.provaFino).slice(0, 10);
    const scuolaId = Number(raw.scuolaId);
    if (!id) throw new Error("Account mancante.");
    if (ruolo !== "sub" && ruolo !== "staff" && ruolo !== "titolare") throw new Error("Scegli sub, staff o titolare.");
    if (provaFino && !/^\d{4}-\d{2}-\d{2}$/.test(provaFino)) throw new Error("Data non valida.");
    if (ruolo === "staff" && piano) throw new Error("Lo staff non ha un piano proprio.");
    if (ruolo === "sub" && piano !== "trial" && piano !== "free" && piano !== "pro") throw new Error("Scegli trial, free o pro.");
    if (ruolo === "staff" && (!Number.isInteger(scuolaId) || scuolaId <= 0)) throw new Error("Scegli la scuola dello staff.");
    return { id, ruolo, piano, provaFino, scuolaId: Number.isInteger(scuolaId) && scuolaId > 0 ? scuolaId : 0 };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const presenti = await sql<{ user_id: string; role: string }>`select user_id, role from profiles where user_id = ${data.id}`;
    if (!presenti[0]) throw new Error("Questo account non ha un profilo. Non ne creo uno nuovo.");
    if (presenti[0].role === "piattaforma") throw new Error("Il gestore è esente. Non ha una scadenza.");
    if (data.ruolo === "sub") {
      const rows = await sql<{ user_id: string }>`
        update profiles
        set ruolo = 'sub', piano = ${data.piano}, prova_fino = ${data.provaFino || null}
        where user_id = ${data.id}
        returning user_id
      `;
      if (!rows[0]) throw new Error("Account non aggiornato.");
      return { ok: true };
    }
    if (data.ruolo === "staff") {
      await assertPostoStaff(sql, data.scuolaId, data.id);
      const rows = await sql<{ user_id: string }>`
        with scelto as (
          select id from club where id = ${data.scuolaId}
        ),
        upd as (
          update profiles
          set ruolo = 'staff', piano = null, prova_fino = null, club_id = (select id from scelto)
          where user_id = ${data.id}
            and exists (select 1 from scelto)
          returning user_id, club_id
        )
        insert into staff_membri (user_id, club_id)
        select user_id, club_id from upd
        on conflict do nothing
        returning user_id
      `;
      if (!rows[0]) {
        const gia = await sql<{ user_id: string }>`
          select user_id from profiles where user_id = ${data.id} and ruolo = 'staff' and club_id = ${data.scuolaId}
        `;
        if (!gia[0]) throw new Error("Account non aggiornato. La scuola non c'è, non ho cambiato nulla.");
      }
      return { ok: true };
    }
    if (data.scuolaId) {
      const scuole = await sql<{ id: number }>`select id from club where id = ${data.scuolaId}`;
      if (!scuole[0]) throw new Error("Scuola non trovata. Non ho cambiato l'account.");
    }
    const rows = await sql<{ user_id: string }>`
      update profiles
      set ruolo = 'titolare',
          piano = null,
          prova_fino = null,
          club_id = coalesce(${data.scuolaId || null}, club_id)
      where user_id = ${data.id}
      returning user_id
    `;
    if (!rows[0]) throw new Error("Account non aggiornato.");
    return { ok: true };
  });

export const impostaPianoDiving = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const piano = asText(raw.piano);
    const provaFino = asText(raw.provaFino).slice(0, 10);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Diving non valido.");
    if (piano !== "trial" && piano !== "active" && piano !== "sospeso") throw new Error("Scegli trial, active o sospeso.");
    if (provaFino && !/^\d{4}-\d{2}-\d{2}$/.test(provaFino)) throw new Error("Data non valida.");
    return { id, piano, provaFino };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number }>`
      update club
      set piano = ${data.piano}, prova_fino = ${data.provaFino || null}
      where id = ${data.id}
      returning id
    `;
    if (!rows[0]) throw new Error("Diving non aggiornato.");
    return { ok: true };
  });

export const listScuole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ScuolaAffiliata[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{
      id: number;
      nome: string;
      sede: string;
      email: string;
      telefono: string;
      stato: string;
      allievi: number;
      schede: number;
      staff: number;
      creato: string;
      has_logo: boolean | string | null;
      senza_titolare: boolean | string | null;
      mezzo_nautico: boolean | string | null;
      posti_extra: number | null;
      posti_limite: number | null;
    }>`
      select c.id, c.nome, c.sede, c.email, c.telefono, c.stato,
             to_char(c.creato_il, 'YYYY-MM-DD') as creato,
             (c.logo_data is not null and c.logo_data <> '') as has_logo,
             (c.owner_user_id is null and c.co_owner_user_id is null) as senza_titolare,
             c.mezzo_nautico, c.posti_extra, c.posti_limite,
             (select count(distinct s.user_id)::int from submissions s join profiles p on p.user_id = s.user_id where s.club_id = c.id and s.status = 'inviato' and p.role = 'subacqueo') as allievi,
             (select count(*)::int from submissions s where s.club_id = c.id and s.status = 'inviato') as schede,
             (select count(*)::int from staff_membri m where m.club_id = c.id and m.user_id is distinct from c.owner_user_id and m.user_id is distinct from c.co_owner_user_id) as staff
      from club c
      order by c.creato_il desc, c.id desc
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      nome: row.nome,
      sede: row.sede,
      email: row.email,
      telefono: row.telefono,
      stato: row.stato === "sospesa" ? "sospesa" : "attiva",
      allievi: Number(row.allievi ?? 0),
      schede: Number(row.schede ?? 0),
      staff: Number(row.staff ?? 0),
      creato: row.creato,
      hasLogo: asBool(row.has_logo),
      senzaTitolare: asBool(row.senza_titolare),
      mezzoNautico: row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico),
      postiExtra: Number(row.posti_extra ?? 0),
      postiLimite: row.posti_limite == null ? null : Number(row.posti_limite),
    }));
  });

export const openOwnDiving = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const nome = asText(raw.nome).trim().slice(0, 120);
    const sede = asText(raw.sede).trim().slice(0, 160);
    if (nome.length < 2) throw new Error("Indica il nome del diving.");
    return { nome, sede };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    if (!profile.clubId) {
      const id = await openSchool(sql, context.userId, data.nome, data.sede);
      await sql`update profiles set club_id = ${id} where user_id = ${context.userId}`;
    }
    return pack(sql, context.userId);
  });

export const setScuolaStato = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const raw = input as Record<string, unknown>;
    const id = Number(raw.id);
    const stato = asText(raw.stato);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    if (stato !== "attiva" && stato !== "sospesa") throw new Error("Stato non valido.");
    return { id, stato };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const club = await loadClubById(sql, data.id);
    if (!club) throw new Error("Scuola non trovata.");
    await sql`update club set stato = ${data.stato} where id = ${data.id}`;
    return { ok: true };
  });

export const eliminaScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const club = await loadClubById(sql, data.id);
    if (!club) throw new Error("Scuola non trovata.");
    const staff = await sql<{ n: number }>`
      select count(*)::int as n from staff_membri
      where club_id = ${data.id}
        and user_id is distinct from ${club.owner_user_id}
        and user_id is distinct from ${club.co_owner_user_id}
    `;
    if (Number(staff[0]?.n ?? 0) > 0) throw new Error("Questa scuola ha dello staff. Non si cancella finché ci sono guide.");
    const orfana = !club.owner_user_id && !club.co_owner_user_id;
    const richieste = await sql<{ id: number }>`
      select id from chiusure_scuola where club_id = ${data.id} and stato = 'in-attesa' limit 1
    `;
    if (!richieste[0] && !orfana) throw new Error("Nessuna richiesta di chiusura da questa scuola.");
    await sql`delete from notification_reads where notification_id in (select id from notifications where club_id = ${data.id})`;
    await sql`delete from notifications where club_id = ${data.id}`;
    await sql`delete from scheda_aperture where submission_id in (select id from submissions where club_id = ${data.id})`;
    await sql`delete from scheda_modifiche where submission_id in (select id from submissions where club_id = ${data.id})`;
    await sql`delete from submissions where club_id = ${data.id}`;
    await sql`delete from uscite where club_id = ${data.id}`;
    await sql`delete from imbarcazioni where club_id = ${data.id}`;
    await sql`delete from staff_membri where club_id = ${data.id}`;
    await sql`
      update profiles p
      set role = case
            when p.role = 'piattaforma' then 'piattaforma'
            when exists (select 1 from staff_membri m where m.user_id = p.user_id) then 'istruttore'
            else 'subacqueo'
          end,
          club_id = (
            select m.club_id from staff_membri m
            where m.user_id = p.user_id
            order by m.club_id
            limit 1
          )
      where p.club_id = ${data.id}
         or p.user_id = ${club.owner_user_id}
         or p.user_id = ${club.co_owner_user_id}
    `;
    await sql`delete from club where id = ${data.id}`;
    await sql`delete from chiusure_scuola where club_id = ${data.id}`;
    return { ok: true };
  });

export const tieniScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number }>`
      update chiusure_scuola set stato = 'tenuta'
      where club_id = ${data.id} and stato = 'in-attesa'
      returning id
    `;
    if (!rows[0]) throw new Error("Nessuna richiesta di chiusura da questa scuola.");
    return { ok: true };
  });

export type RichiestaMezzo = { id: number; nome: string; sede: string };

export const listRichiesteMezzo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RichiestaMezzo[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number; nome: string; sede: string }>`
      select id, nome, sede from club
      where mezzo_richiesto = true and mezzo_nautico = false
      order by id desc
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome, sede: row.sede }));
  });

export const chiediMezzoNautico = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare può chiedere il mezzo nautico.");
    if (club.mezzo_nautico == null ? true : asBool(club.mezzo_nautico)) throw new Error("Questo diving ha già il mezzo nautico.");
    if (asBool(club.mezzo_richiesto)) throw new Error("Richiesta già inviata.");
    await sql`update club set mezzo_richiesto = true where id = ${club.id}`;
    const titolo = "Richiesta mezzo nautico";
    const corpo = `${club.nome} · ${profile.nome} ${profile.cognome}`.replace(/\s+/g, " ").trim();
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id, user_id, affiliazione_id)
      values (null, ${titolo}, ${corpo}, 'piattaforma', null, ${context.userId}, null)
    `;
    const gestori = await sql<{ user_id: string }>`select user_id from profiles where role = 'piattaforma'`;
    await pushUsers(sql, gestori.map((row) => row.user_id), titolo, corpo, "/");
    return { ok: true };
  });

export const confermaMezzoNautico = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number }>`
      update club set mezzo_nautico = true, mezzo_richiesto = false
      where id = ${data.id} and mezzo_nautico = false
      returning id
    `;
    if (!rows[0]) throw new Error("Nessuna scuola da sbloccare.");
    return { ok: true };
  });

export const impostaMezzoNautico = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Scuola non valida.");
    if (raw.attivo !== true && raw.attivo !== false) throw new Error("Scelta non valida.");
    return { id, attivo: raw.attivo === true };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number }>`
      update club set mezzo_nautico = ${data.attivo}, mezzo_richiesto = false
      where id = ${data.id}
      returning id
    `;
    if (!rows[0]) throw new Error("Scuola non trovata.");
    return { ok: true };
  });

export type ChiusuraScuola = {
  id: number;
  clubId: number;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  scuola: string;
  creato: string;
};

export const listChiusure = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ChiusuraScuola[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{
      id: number;
      club_id: number;
      nome: string;
      cognome: string;
      telefono: string;
      email: string;
      scuola: string;
      creato: string;
    }>`
      select id, club_id, nome, cognome, telefono, email, scuola, to_char(creato_il, 'YYYY-MM-DD') as creato
      from chiusure_scuola
      where stato = 'in-attesa'
      order by id desc
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      clubId: Number(row.club_id),
      nome: row.nome,
      cognome: row.cognome,
      telefono: row.telefono,
      email: row.email,
      scuola: row.scuola,
      creato: row.creato,
    }));
  });

export const updateCodiceGestore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
    const codice = asText((input as Record<string, unknown>).codice).trim().slice(0, 40);
    if (codice.length < 8) throw new Error("Il codice gestore deve avere almeno 8 caratteri.");
    return { codice };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    await sql`update platform set codice = ${data.codice} where id = 1`;
    return { ok: true };
  });

export const seedExamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ inserted: number }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from submissions
      where payload->>'esempio' = 'si' and club_id = ${profile.clubId}
    `;
    if (Number(existing[0]?.n ?? 0) > 0) return { inserted: 0 };
    const author = `${profile.cognome} ${profile.nome}`.trim();
    const oggi = todayRome();
    const samples: { key: string; payload: Record<string, string> }[] = [
      {
        key: "registro-immersione",
        payload: {
          esempio: "si",
          cognome: "Rossi",
          nome: "Giulia",
          codice_fiscale: "RSSGLI90A41H501X",
          data_nascita: "1990-01-01",
          luogo_nascita: "Genova",
          indirizzo: "Via del Molo 3",
          citta: "Genova",
          telefono: "3330000000",
          email: "giulia.rossi.esempio@email.it",
          tipo_documento: "Carta di identità",
          numero_documento: "CA00000ES",
          data_immersione: oggi,
          tipo_attivita: "Immersione guidata",
          didattica: "PADI",
          livello: "Open Water",
          numero_brevetto: "OW-000000",
          autorespiratore: "ARA monobombola",
          miscela: "Aria",
          buddy: "Marco Bianchi",
          emergenza_nome: "Luca Rossi",
          emergenza_telefono: "3330000001",
          consenso_privacy: "si",
          firma: "Giulia Rossi",
        },
      },
      {
        key: "registro-attrezzatura",
        payload: {
          esempio: "si",
          categoria: "Bombola",
          marca: "Faber",
          modello: "12 L",
          matricola: "ESEMPIO-12L",
          proprieta: "ASD",
          data_intervento: oggi,
          tipo_intervento: "Controllo visivo",
          esito: "Idoneo",
          prossima_scadenza: oggi,
          officina: "Officina interna",
          firma: author,
        },
      },
    ];
    let inserted = 0;
    for (const sample of samples) {
      const form = formByKey(sample.key);
      if (!form) continue;
      const payload = cleanPayload(form, sample.payload);
      payload.esempio = "si";
      const subject = `${subjectOf(form, payload)} (esempio)`;
      await sql`
        insert into submissions (user_id, author_name, form_key, subject_name, dive_date, status, payload, club_id)
        values (
          ${context.userId},
          ${author},
          ${form.key},
          ${subject},
          ${referenceDate(form, payload)},
          ${"inviato"},
          ${JSON.stringify(payload)}::jsonb,
          ${profile.clubId}
        )
      `;
      inserted += 1;
    }
    return { inserted };
  });

export type Affiliazione = {
  id: number;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  divingNome: string;
  sede: string;
  codiceFiscale: string;
  divingEmail: string;
  divingTelefono: string;
  stato: "in-attesa" | "codice-inviato" | "accettata";
  codice: string | null;
  creato: string;
  anagraficaNota: NotaAnagrafica | null;
  mezzoNautico: boolean | null;
};

function mailValida(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readAffiliazione(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Dati mancanti.");
  const raw = input as Record<string, unknown>;
  const nome = asText(raw.nome).trim().slice(0, 80);
  const cognome = asText(raw.cognome).trim().slice(0, 80);
  const telefono = asText(raw.telefono).trim().slice(0, 40);
  const email = asText(raw.email).trim().slice(0, 120);
  const divingNome = asText(raw.divingNome).trim().slice(0, 120);
  const sede = asText(raw.sede).trim().slice(0, 160);
  const codiceFiscale = asText(raw.codiceFiscale).trim().slice(0, 20);
  const divingEmail = asText(raw.divingEmail).trim().slice(0, 120);
  const divingTelefono = asText(raw.divingTelefono).trim().slice(0, 40);
  if (!nome) throw new Error("Il nome è obbligatorio.");
  if (!cognome) throw new Error("Il cognome è obbligatorio.");
  if (telefono.replace(/\D/g, "").length < 8) throw new Error("Il cellulare è obbligatorio.");
  if (!mailValida(email)) throw new Error("La mail è obbligatoria.");
  if (divingNome.length < 2) throw new Error("Il nome del diving è obbligatorio.");
  if (sede.length < 5) throw new Error("L'indirizzo del diving è obbligatorio.");
  if (codiceFiscale.replace(/\s/g, "").length < 11) throw new Error("Il codice fiscale del diving è obbligatorio.");
  if (divingEmail && !mailValida(divingEmail)) throw new Error("La mail del diving non è valida.");
  if (raw.mezzoNautico !== true && raw.mezzoNautico !== false) throw new Error("Scegli se il centro ha un mezzo nautico.");
  return {
    nome,
    cognome,
    telefono,
    email,
    divingNome,
    sede,
    codiceFiscale,
    divingEmail,
    divingTelefono,
    anagrafica: notaAnagrafica(raw.anagrafica),
    mezzoNautico: raw.mezzoNautico === true,
  };
}

function mapAffiliazione(row: {
  id: number;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  diving_nome: string;
  sede: string;
  codice_fiscale: string;
  diving_email: string;
  diving_telefono: string;
  stato: string;
  codice: string | null;
  creato: string;
  anagrafica_nota: string | null;
  mezzo_nautico: boolean | string | null;
}): Affiliazione {
  const stato = row.stato === "codice-inviato" || row.stato === "accettata" ? row.stato : "in-attesa";
  return {
    id: Number(row.id),
    nome: row.nome,
    cognome: row.cognome,
    telefono: row.telefono,
    email: row.email,
    divingNome: row.diving_nome,
    sede: row.sede,
    codiceFiscale: row.codice_fiscale,
    divingEmail: row.diving_email,
    divingTelefono: row.diving_telefono,
    stato,
    codice: row.codice,
    creato: row.creato,
    anagraficaNota: leggiNotaAnagrafica(row.anagrafica_nota),
    mezzoNautico: row.mezzo_nautico == null ? null : asBool(row.mezzo_nautico),
  };
}

const AFFILIA_FIELDS = `
  id, nome, cognome, telefono, email, diving_nome, sede, codice_fiscale, diving_email, diving_telefono, stato, codice,
  anagrafica_nota, mezzo_nautico,
  to_char(creato_il, 'YYYY-MM-DD') as creato
`;

export const chiediAffiliazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readAffiliazione(input))
  .handler(async ({ context, data }): Promise<Affiliazione> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || profile.role === "piattaforma") throw new Error("Il gestore apre il diving da Gestione.");
    if (profile.role === "scuola") throw new Error("Sei già titolare di un diving.");
    const open = await sql<{ id: number }>`
      select id from affiliazioni
      where user_id = ${context.userId} and stato <> 'accettata'
      limit 1
    `;
    if (open[0]) throw new Error("Hai già una richiesta in attesa.");
    const rows = await sql<{ id: number }>`
      insert into affiliazioni (
        user_id, nome, cognome, telefono, email, diving_nome, sede, codice_fiscale, diving_email, diving_telefono, anagrafica_nota, mezzo_nautico
      ) values (
        ${context.userId}, ${data.nome}, ${data.cognome}, ${data.telefono}, ${data.email},
        ${data.divingNome}, ${data.sede}, ${data.codiceFiscale}, ${data.divingEmail}, ${data.divingTelefono},
        ${JSON.stringify(data.anagrafica)}, ${data.mezzoNautico}
      )
      returning id
    `;
    await sql`
      update profiles
      set nome = ${data.nome}, cognome = ${data.cognome}, telefono = ${data.telefono}
      where user_id = ${context.userId}
    `;
    const saved = await sql.query<Parameters<typeof mapAffiliazione>[0]>(
      `select ${AFFILIA_FIELDS} from affiliazioni where id = $1`,
      [rows[0]?.id],
    );
    const item = saved[0] ? mapAffiliazione(saved[0]) : null;
    if (!item) throw new Error("Richiesta non salvata.");
    const avviso = await sql<RigaAvviso>`
      select id, user_id, nome, cognome, diving_nome, anagrafica_nota, stato
      from affiliazioni where id = ${item.id}
    `;
    if (avviso[0]) {
      await inserisciAvvisoPiattaforma(sql, avviso[0]);
      await inserisciAvvisoEsito(sql, avviso[0], false);
    }
    const gestori = await sql<{ user_id: string }>`select user_id from profiles where role = 'piattaforma'`;
    await pushUsers(
      sql,
      gestori.map((row) => row.user_id),
      "Nuova richiesta di affiliazione",
      `${data.nome} ${data.cognome} vuole aprire ${data.divingNome}. ${testoNotaAnagrafica(data.anagrafica)}`,
      "/",
    );
    return item;
  });

export const miaAffiliazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Affiliazione | null> => {
    const sql = await getSql();
    const rows = await sql.query<Parameters<typeof mapAffiliazione>[0]>(
      `select ${AFFILIA_FIELDS} from affiliazioni where user_id = $1 order by id desc limit 1`,
      [context.userId],
    );
    return rows[0] ? mapAffiliazione(rows[0]) : null;
  });

export const listAffiliazioni = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Affiliazione[]> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql.query<Parameters<typeof mapAffiliazione>[0]>(
      `select ${AFFILIA_FIELDS} from affiliazioni where stato <> 'accettata' order by id desc`,
    );
    return rows.map(mapAffiliazione);
  });

export const inviaCodiceAffiliazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Richiesta non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<Affiliazione> => {
    const sql = await getSql();
    await requirePlatform(sql, context.userId);
    const rows = await sql<{ id: number; stato: string; codice: string | null }>`
      select id, stato, codice from affiliazioni where id = ${data.id}
    `;
    const row = rows[0];
    if (!row || row.stato === "accettata") throw new Error("Richiesta non trovata.");
    let codice = row.codice ?? "";
    let appena = false;
    if (!codice) {
      codice = await uniqueCode(sql, "titolare");
      const clash = await sql<{ n: number }>`
        select count(*)::int as n from affiliazioni where lower(codice) = lower(${codice})
      `;
      if (Number(clash[0]?.n ?? 0) > 0) codice = await uniqueCode(sql, "titolare");
      await sql`
        update affiliazioni set codice = ${codice}, stato = 'codice-inviato' where id = ${data.id}
      `;
      appena = true;
    }
    const avviso = await sql<RigaAvviso>`
      select id, user_id, nome, cognome, diving_nome, anagrafica_nota, stato
      from affiliazioni where id = ${data.id}
    `;
    if (avviso[0]) {
      await inserisciAvvisoEsito(sql, avviso[0], true);
      if (appena) {
        await pushUsers(
          sql,
          [avviso[0].user_id],
          "Codice pronto",
          "Il gestore ha preparato il codice. Inseriscilo dal Profilo.",
          "/notifiche",
        );
      }
    }
    const saved = await sql.query<Parameters<typeof mapAffiliazione>[0]>(
      `select ${AFFILIA_FIELDS} from affiliazioni where id = $1`,
      [data.id],
    );
    if (!saved[0]) throw new Error("Richiesta non trovata.");
    return mapAffiliazione(saved[0]);
  });

export const riscattaAffiliazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const codice = asText((input as { codice?: unknown } | null)?.codice).trim().slice(0, 40);
    if (codice.length < 6) throw new Error("Inserisci il codice.");
    return { codice };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile || profile.role === "piattaforma") throw new Error("Il gestore apre il diving da Gestione.");
    if (profile.role === "scuola") throw new Error("Sei già titolare di un diving.");
    const rows = await sql<{
      id: number;
      user_id: string;
      diving_nome: string;
      sede: string;
      codice_fiscale: string;
      diving_email: string;
      diving_telefono: string;
      nome: string;
      cognome: string;
      telefono: string;
      mezzo_nautico: boolean | string | null;
    }>`
      select id, user_id, diving_nome, sede, codice_fiscale, diving_email, diving_telefono, nome, cognome, telefono, mezzo_nautico
      from affiliazioni
      where lower(codice) = lower(${data.codice}) and stato = 'codice-inviato'
      limit 1
    `;
    const row = rows[0];
    if (!row || row.user_id !== context.userId) throw new Error("Codice non valido.");
    const staff = await uniqueCode(sql, "staff");
    const owner = await uniqueCode(sql, "owner");
    const allievi = await uniqueCode(sql, "allievi");
    const nato = nascitaDiving(todayRome());
    const created = await sql<{ id: number }>`
      insert into club (
        nome, codice_fiscale, sede, email, telefono, codice_staff, codice_proprietario, codice_allievi, owner_user_id, stato, piano, prova_fino, mezzo_nautico
      ) values (
        ${row.diving_nome}, ${row.codice_fiscale}, ${row.sede}, ${row.diving_email}, ${row.diving_telefono},
        ${staff}, ${owner}, ${allievi}, ${context.userId}, 'attiva', ${nato.piano || null}, ${nato.provaFino || null},
        ${row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico)}
      )
      returning id
    `;
    const clubId = Number(created[0]?.id);
    if (!clubId) throw new Error("Non riesco ad aprire il diving.");
    await sql`
      update profiles
      set role = 'scuola', club_id = ${clubId}, nome = ${row.nome}, cognome = ${row.cognome}, telefono = ${row.telefono},
          ruolo = 'titolare', piano = null, prova_fino = null
      where user_id = ${context.userId}
    `;
    await sql`update affiliazioni set stato = 'accettata' where id = ${row.id}`;
    const avviso = await sql<RigaAvviso>`
      select id, user_id, nome, cognome, diving_nome, anagrafica_nota, stato
      from affiliazioni where id = ${row.id}
    `;
    if (avviso[0]) await inserisciAvvisoEsito(sql, avviso[0], true);
    return pack(sql, context.userId);
  });

export const accettaAccordo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare accetta l'accordo.");
    await sql`
      update club set accordo_version = ${ACCORDO_VERSION}, accordo_at = now() where id = ${club.id}
    `;
    return pack(sql, context.userId);
  });

export const salvaChiaveScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const pubblica = asText((input as { pubblica?: unknown } | null)?.pubblica).trim();
    if (pubblica.length < 40 || pubblica.length > 400) throw new Error("Chiave non valida.");
    return { pubblica };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare registra la chiave.");
    if (club.chiave_pubblica) throw new Error("La chiave c'è già. Sul telefono nuovo inserisci il codice di recupero.");
    await sql`update club set chiave_pubblica = ${data.pubblica} where id = ${club.id}`;
    return pack(sql, context.userId);
  });

export const listaBusteScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: number; cifrato: string }[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare può leggere le schede chiuse.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    const rows = await sql<{ id: number; cifrato: string }>`
      select id, payload->>'cifrato' as cifrato
      from submissions
      where club_id = ${club.id} and coalesce(payload->>'cifrato', '') <> ''
      order by id
    `;
    return rows.map((row) => ({ id: Number(row.id), cifrato: row.cifrato }));
  });

export const passaScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const userId = asText(raw.userId).trim();
    const pubblica = asText(raw.pubblica).trim();
    if (!userId) throw new Error("Scegli una persona dello staff.");
    if (pubblica.length < 40 || pubblica.length > 400) throw new Error("Chiave nuova non valida.");
    const list = Array.isArray(raw.buste) ? raw.buste : [];
    if (list.length > 500) throw new Error("Troppe schede da richiudere.");
    const buste = list.map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const id = Number(row.id);
      const cifrato = asText(row.cifrato).trim();
      if (!Number.isInteger(id) || id <= 0 || !cifrato.startsWith("{") || cifrato.length > 400000) {
        throw new Error("Una scheda non è stata richiusa.");
      }
      return { id, cifrato };
    });
    return { userId, pubblica, buste };
  })
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || club.owner_user_id !== context.userId) throw new Error("Solo il primo titolare può passare la scuola.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    if (data.userId === context.userId) throw new Error("Scegli un'altra persona.");
    const staff = await sql<{ n: number }>`
      select count(*)::int as n from staff_membri where club_id = ${club.id} and user_id = ${data.userId}
    `;
    if (Number(staff[0]?.n ?? 0) === 0) throw new Error("Questa persona non è nello staff.");
    const attese = await sql<{ id: number; payload: unknown }>`
      select id, payload from submissions
      where club_id = ${club.id} and coalesce(payload->>'cifrato', '') <> ''
    `;
    const ids = new Set(attese.map((row) => Number(row.id)));
    if (ids.size !== data.buste.length || data.buste.some((busta) => !ids.has(busta.id))) {
      throw new Error("Manca una scheda da richiudere. Il passaggio non è stato fatto.");
    }
    for (const busta of data.buste) {
      const row = attese.find((item) => Number(item.id) === busta.id);
      const payload = asPayload(row?.payload);
      payload.cifrato = busta.cifrato;
      await sql`
        update submissions set payload = ${JSON.stringify(payload)}::jsonb
        where id = ${busta.id} and club_id = ${club.id}
      `;
    }
    await sql`update club set chiave_pubblica = ${data.pubblica} where id = ${club.id}`;
    await sql`
      update club
      set owner_user_id = ${data.userId},
          co_owner_user_id = case when co_owner_user_id = ${data.userId} then null else co_owner_user_id end
      where id = ${club.id}
    `;
    await sql`update profiles set role = 'scuola', club_id = ${club.id} where user_id = ${data.userId}`;
    await sql`delete from staff_membri where club_id = ${club.id} and user_id = ${data.userId}`;
    await sql`update profiles set role = 'subacqueo', club_id = null where user_id = ${context.userId}`;
    await sql`delete from staff_membri where club_id = ${club.id} and user_id = ${context.userId}`;
    return pack(sql, context.userId);
  });

export const secondoTitolare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ userId: string; nome: string; cognome: string } | null> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId) || !club.co_owner_user_id) return null;
    const rows = await sql<{ user_id: string; nome: string; cognome: string }>`
      select user_id, nome, cognome from profiles where user_id = ${club.co_owner_user_id} limit 1
    `;
    const row = rows[0];
    return row ? { userId: row.user_id, nome: row.nome, cognome: row.cognome } : null;
  });

export const aggiungiSecondoTitolare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const userId = asText((input as { userId?: unknown } | null)?.userId).trim();
    if (!userId) throw new Error("Scegli una persona dello staff.");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo un titolare può aggiungere l'altro.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    if (data.userId === club.owner_user_id || data.userId === context.userId) throw new Error("Scegli un'altra persona.");
    const staff = await sql<{ n: number }>`
      select count(*)::int as n from staff_membri where club_id = ${club.id} and user_id = ${data.userId}
    `;
    if (Number(staff[0]?.n ?? 0) === 0) throw new Error("Questa persona non è nello staff.");
    const altro = await sql<{ id: number }>`
      select id from club
      where id <> ${club.id} and (owner_user_id = ${data.userId} or co_owner_user_id = ${data.userId})
      limit 1
    `;
    if (altro.length) throw new Error("Questa persona è già titolare di un altro diving.");
    const updated = await sql<{ id: number }>`
      update club set co_owner_user_id = ${data.userId}
      where id = ${club.id} and co_owner_user_id is null
      returning id
    `;
    if (!updated[0]) throw new Error("I titolari sono già due.");
    await sql`update profiles set role = 'scuola', club_id = ${club.id} where user_id = ${data.userId}`;
    await sql`delete from staff_membri where club_id = ${club.id} and user_id = ${data.userId}`;
    return { ok: true };
  });

export const togliSecondoTitolare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo un titolare può togliere l'altro.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    const secondo = club.co_owner_user_id;
    if (!secondo) throw new Error("Non c'è un secondo titolare.");
    await sql`update club set co_owner_user_id = null where id = ${club.id}`;
    await sql`update profiles set role = 'istruttore', club_id = ${club.id} where user_id = ${secondo}`;
    await sql`
      insert into staff_membri (user_id, club_id)
      values (${secondo}, ${club.id})
      on conflict do nothing
    `;
    return { ok: true };
  });

export const sospendiModuli = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ accetta: (input as { accetta?: unknown } | null)?.accetta !== false }))
  .handler(async ({ context, data }): Promise<SessionContext> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare può chiudere i moduli.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    await sql`update club set accetta_moduli = ${data.accetta} where id = ${club.id}`;
    return pack(sql, context.userId);
  });

type DocRow = { user_id: string; kind: string; scadenza: string | null };

function statoDocumento(rows: DocRow[], userId: string, kind: string, oggi: string): "ok" | "assente" | "scaduto" {
  const mine = rows.filter((row) => row.user_id === userId && row.kind === kind);
  if (!mine.length) return "assente";
  const dates = mine.map((row) => (row.scadenza ?? "").slice(0, 10)).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  if (!dates.length) return "ok";
  const latest = dates.sort().at(-1) ?? "";
  return latest < oggi ? "scaduto" : "ok";
}

function motivoGuida(rows: DocRow[], userId: string, oggi: string): string {
  const medico = statoDocumento(rows, userId, "medico", oggi);
  const polizza = statoDocumento(rows, userId, "assicurazione", oggi);
  const motivi: string[] = [];
  if (medico === "assente") motivi.push("Certificato medico assente");
  if (medico === "scaduto") motivi.push("Certificato medico scaduto");
  if (polizza === "assente") motivi.push("Polizza assente");
  if (polizza === "scaduto") motivi.push("Polizza scaduta");
  return motivi.join(". ");
}

function documentoAncoraValido(scadenza: string | null, oggi: string): boolean {
  const day = (scadenza ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
  return day >= oggi;
}

function statoCaricato(
  rows: { scadenza: string | null }[],
  oggi: string,
): "ok" | "assente" | "scaduto" {
  if (!rows.length) return "assente";
  return rows.some((row) => documentoAncoraValido(row.scadenza, oggi)) ? "ok" : "scaduto";
}

function elencoScadenze(rows: { scadenza: string | null }[]): (string | null)[] {
  return rows.map((row) => {
    const day = (row.scadenza ?? "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  });
}

export type GuidaUscita = {
  userId: string;
  nome: string;
  cognome: string;
  puoUscire: boolean;
  motivo: string;
};

export type CandidatoUscita = {
  userId: string;
  nome: string;
  cognome: string;
  didattica: string;
  livello: string;
  numero: string;
  fonte: "" | "area" | "modulo";
  dataBrevetto: string;
  nomeBrevetto: string;
  profondita: number | null;
  didatticaSpecifica: string;
  periodoInizio: string;
  periodoFine: string;
};

export type RigaUscita = {
  id: number;
  userId: string | null;
  cognome: string;
  nome: string;
  didattica: string;
  livello: string;
  numeroBrevetto: string;
  allievo: boolean;
  orarioFine: string;
  profondita: string;
  autorespiratore: string;
  miscela: string;
  percentualeO2: string;
  metriBrevetto: number | null;
};

export type GruppoUscita = {
  id: number;
  guidaUserId: string | null;
  guidaNome: string;
  passaggio: boolean;
  motivoRapporto: string;
  righe: RigaUscita[];
};

export type UscitaGiorno = {
  id: number;
  data: string;
  localita: string;
  punto: string;
  imbarcazione: string;
  imbarcazioneId: number | null;
  guidaUserId: string | null;
  guidaNome: string;
  orarioInizio: string;
  motivoRapporto: string;
  chiusaPrima: string | null;
  chiusaDopo: string | null;
  viaggioId: number | null;
  gruppi: GruppoUscita[];
  righe: RigaUscita[];
};

function rigaUscita(item: {
  id: number;
  user_id: string | null;
  cognome: string;
  nome: string;
  didattica: string;
  livello: string;
  numero_brevetto: string;
  allievo: boolean;
  orario_fine: string;
  profondita: string;
  autorespiratore: string;
  miscela: string;
  percentuale_o2: string;
}): RigaUscita {
  return {
    id: Number(item.id),
    userId: item.user_id,
    cognome: item.cognome,
    nome: item.nome,
    didattica: item.didattica,
    livello: item.livello,
    numeroBrevetto: item.numero_brevetto,
    allievo: Boolean(item.allievo),
    orarioFine: item.orario_fine,
    profondita: item.profondita,
    autorespiratore: item.autorespiratore,
    miscela: item.miscela,
    percentualeO2: item.percentuale_o2,
    metriBrevetto: null,
  };
}

async function loadUscita(sql: Sql, clubId: number, id: number): Promise<UscitaGiorno> {
  const rows = await sql<{
    id: number;
    data: string;
    localita: string;
    punto: string;
    imbarcazione: string;
    imbarcazione_id: number | null;
    guida_user_id: string | null;
    guida_nome: string;
    orario_inizio: string;
    motivo_rapporto: string;
    chiusa_prima: string | null;
    chiusa_dopo: string | null;
    viaggio_id: number | null;
  }>`
    select id, data::text as data, localita, punto, imbarcazione, imbarcazione_id, guida_user_id, guida_nome, orario_inizio, motivo_rapporto, viaggio_id,
           to_char(chiusa_prima, 'YYYY-MM-DD"T"HH24:MI') as chiusa_prima,
           to_char(chiusa_dopo, 'YYYY-MM-DD"T"HH24:MI') as chiusa_dopo
    from uscite where id = ${id} and club_id = ${clubId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Uscita non trovata.");
  const gruppiRows = await sql<{
    id: number;
    guida_user_id: string | null;
    guida_nome: string;
    passaggio: boolean;
    motivo_rapporto: string;
  }>`
    select id, guida_user_id, guida_nome, passaggio, motivo_rapporto
    from uscita_gruppi where uscita_id = ${id} order by id
  `;
  const righeRows = await sql<{
    id: number;
    gruppo_id: number | null;
    user_id: string | null;
    cognome: string;
    nome: string;
    didattica: string;
    livello: string;
    numero_brevetto: string;
    allievo: boolean;
    orario_fine: string;
    profondita: string;
    autorespiratore: string;
    miscela: string;
    percentuale_o2: string;
  }>`
    select id, gruppo_id, user_id, cognome, nome, didattica, livello, numero_brevetto, allievo, orario_fine, profondita, autorespiratore, miscela, percentuale_o2
    from uscita_righe where uscita_id = ${id} order by cognome, nome, id
  `;
  const gruppi: GruppoUscita[] = gruppiRows.map((gruppo) => ({
    id: Number(gruppo.id),
    guidaUserId: gruppo.guida_user_id,
    guidaNome: gruppo.guida_nome || (gruppo.passaggio ? "Solo passaggio" : "Guida"),
    passaggio: Boolean(gruppo.passaggio),
    motivoRapporto: gruppo.motivo_rapporto,
    righe: righeRows.filter((item) => Number(item.gruppo_id) === Number(gruppo.id)).map(rigaUscita),
  }));
  const assegnate = new Set(gruppi.flatMap((gruppo) => gruppo.righe.map((item) => item.id)));
  const orfane = righeRows.filter((item) => !assegnate.has(Number(item.id))).map(rigaUscita);
  if (orfane.length) {
    if (gruppi[0]) gruppi[0].righe.push(...orfane);
    else {
      gruppi.push({
        id: 0,
        guidaUserId: row.guida_user_id,
        guidaNome: row.guida_nome || "Guida",
        passaggio: !row.guida_user_id,
        motivoRapporto: row.motivo_rapporto,
        righe: orfane,
      });
    }
  }
  const righe = gruppi.flatMap((gruppo) => gruppo.righe);
  const giorno = row.data.slice(0, 10);
  const utenti = [...new Set(righe.flatMap((item) => (item.userId ? [item.userId] : [])))];
  if (utenti.length) {
    const schede = await sql.query<{ user_id: string; payload: unknown; dive_date: string | null }>(
      `select distinct on (user_id) user_id, payload, dive_date::text as dive_date
       from submissions
       where club_id = $1 and status = 'inviato' and form_key = 'registro-immersione'
         and user_id = any($2::text[])
       order by user_id, created_at desc, id desc`,
      [clubId, utenti],
    );
    const metriDi = new Map(
      schede
        .filter((scheda) => schedaCopreGiorno(scheda.payload, scheda.dive_date, giorno))
        .map((scheda) => [scheda.user_id, metriIndicati(testoCampo(oggettoPayload(scheda.payload), "profondita_massima"))]),
    );
    for (const item of righe) {
      item.metriBrevetto = item.userId ? (metriDi.get(item.userId) ?? null) : null;
    }
  }
  return {
    id: Number(row.id),
    data: row.data.slice(0, 10),
    localita: row.localita,
    punto: row.punto,
    imbarcazione: row.imbarcazione,
    imbarcazioneId: row.imbarcazione_id == null ? null : Number(row.imbarcazione_id),
    guidaUserId: row.guida_user_id,
    guidaNome: gruppi.map((gruppo) => gruppo.guidaNome).filter(Boolean).join(", ") || row.guida_nome,
    orarioInizio: row.orario_inizio,
    motivoRapporto: row.motivo_rapporto,
    chiusaPrima: row.chiusa_prima,
    chiusaDopo: row.chiusa_dopo,
    viaggioId: row.viaggio_id == null ? null : Number(row.viaggio_id),
    gruppi,
    righe,
  };
}

export const listGuideUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GuidaUscita[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const people = await sql<{ user_id: string; nome: string; cognome: string }>`
      select p.user_id, p.nome, p.cognome
      from profiles p
      where p.user_id in (
          select owner_user_id from club where id = ${profile.clubId}
          union
          select co_owner_user_id from club where id = ${profile.clubId}
        )
         or p.user_id in (select user_id from staff_membri where club_id = ${profile.clubId})
      order by p.cognome, p.nome
    `;
    const ids = people.map((person) => person.user_id);
    const docs = ids.length
      ? await sql.query<DocRow>(
          `select user_id, kind, scadenza::text as scadenza from documenti_personali where user_id = any($1::text[]) and kind in ('medico', 'assicurazione')`,
          [ids],
        )
      : [];
    const oggi = todayRome();
    return people.map((person) => {
      const motivo = motivoGuida(docs, person.user_id, oggi);
      return {
        userId: person.user_id,
        nome: person.nome,
        cognome: person.cognome,
        puoUscire: motivo === "",
        motivo,
      };
    });
  });

type VoceBrevetto = {
  nome: string;
  didattica: string;
  livello: string;
  numero: string;
  fonte: "area" | "modulo";
  data: string;
  profondita: number | null;
  ordine: number;
};

function metriIndicati(value: string): number | null {
  const text = value.trim().replace(",", ".");
  const match = text.match(/^(\d+(?:\.\d+)?)(?:\s*(?:m|metri))?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 400) return null;
  return n;
}

function metriNelTesto(value: string): number | null {
  if (!value.trim()) return null;
  const found: number[] = [];
  const aggiungi = (raw: string | undefined) => {
    const n = metriIndicati(raw ?? "");
    if (n != null) found.push(n);
  };
  for (const match of value.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m\b|metri\b)/gi)) aggiungi(match[1]);
  for (const match of value.matchAll(/profondit[àa](?:\s+(?:massima|massimo|max|consentita|raggiungibile))?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/gi)) aggiungi(match[1]);
  if (!found.length) return null;
  return Math.max(...found);
}

function oggettoPayload(value: unknown): Record<string, unknown> {
  let source: unknown = value;
  if (typeof value === "string") {
    try {
      source = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  return source as Record<string, unknown>;
}

function testoCampo(source: Record<string, unknown>, key: string): string {
  const item = source[key];
  if (typeof item === "string") return item.trim();
  if (typeof item === "number" && Number.isFinite(item)) return String(item);
  return "";
}

function dataModuloBrevetto(dive: string | null | undefined, creato: string | null | undefined, payload: unknown): string {
  const rilascio = testoCampo(oggettoPayload(payload), "data_rilascio");
  const date = [dive?.slice(0, 10) ?? "", creato?.slice(0, 10) ?? "", rilascio].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return date.sort().at(-1) ?? "";
}

function scegliModuloBrevetto<T extends { id: number; payload: unknown; dive_date?: string | null; giorno?: string | null }>(righe: T[]): T | null {
  if (!righe.length) return null;
  return [...righe].sort((a, b) => {
    const data = dataModuloBrevetto(b.dive_date, b.giorno, b.payload).localeCompare(dataModuloBrevetto(a.dive_date, a.giorno, a.payload));
    if (data !== 0) return data;
    return Number(b.id) - Number(a.id);
  })[0] ?? null;
}

function campiModuloBrevetto(payload: unknown): { didattica: string; livello: string; numero: string; profondita: number | null } {
  const source = oggettoPayload(payload);
  return {
    didattica: testoCampo(source, "didattica"),
    livello: testoCampo(source, "livello"),
    numero: testoCampo(source, "numero_brevetto"),
    profondita: metriIndicati(testoCampo(source, "profondita_massima")),
  };
}

function periodoIndicato(payload: unknown): { inizio: string; fine: string } | null {
  const source = oggettoPayload(payload);
  const inizio = giornoIso(testoCampo(source, "data_inizio"));
  const fine = giornoIso(testoCampo(source, "data_fine"));
  if (!inizio || !fine || fine < inizio) return null;
  return { inizio, fine };
}

function schedaCopreGiorno(payload: unknown, diveDate: string | null, giorno: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return false;
  const periodo = periodoIndicato(payload);
  if (periodo) return periodo.inizio <= giorno && giorno <= periodo.fine;
  const singolo = giornoIso(diveDate) || giornoIso(testoCampo(oggettoPayload(payload), "data_immersione"));
  return singolo === giorno;
}

function giornoIso(value: string | null | undefined): string {
  const day = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function controllaPeriodoScheda(payload: Record<string, string>) {
  const inizio = giornoIso(payload.data_inizio);
  const fine = giornoIso(payload.data_fine);
  if (!payload.data_inizio?.trim() && !payload.data_fine?.trim()) return;
  if (!inizio || !fine) throw new Error("Indica sia l'inizio sia la fine del periodo.");
  if (fine < inizio) throw new Error("La data di fine periodo è prima dell'inizio.");
}

function campiSchedaSubacqueo(payload: unknown): { cognome: string; nome: string; didattica: string; livello: string; numero: string } | null {
  const source = oggettoPayload(payload);
  const cognome = testoCampo(source, "cognome");
  const nome = testoCampo(source, "nome");
  if (!cognome && !nome) return null;
  let didattica = testoCampo(source, "didattica");
  const specifica = testoCampo(source, "didattica_specifica");
  if ((didattica === "Altro" || didattica === "Altra") && specifica) didattica = specifica;
  return {
    cognome,
    nome,
    didattica,
    livello: testoCampo(source, "livello"),
    numero: testoCampo(source, "numero_brevetto"),
  };
}

function scegliBrevetto(voci: VoceBrevetto[]): VoceBrevetto | null {
  if (!voci.length) return null;
  const conProfondita = voci.filter((voce) => voce.profondita != null);
  const pool = conProfondita.length ? conProfondita : voci;
  return [...pool].sort((a, b) => {
    const da = a.profondita ?? -1;
    const db = b.profondita ?? -1;
    if (db !== da) return db - da;
    if (a.fonte !== b.fonte) return a.fonte === "area" ? -1 : 1;
    return b.ordine - a.ordine;
  })[0] ?? null;
}

function specificaDidattica(payload: unknown): string {
  const source = oggettoPayload(payload);
  if (testoCampo(source, "didattica") !== "Altro") return "";
  return testoCampo(source, "didattica_specifica");
}

export const listCandidatiUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ delGiorno: CandidatoUscita[]; archivio: CandidatoUscita[] }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const uscite = await sql<{ data: string }>`
      select data::text as data from uscite where id = ${data.id} and club_id = ${profile.clubId} limit 1
    `;
    const giorno = uscite[0]?.data?.slice(0, 10) ?? "";
    const ultimeSchede = giorno
      ? await sql<{ user_id: string; payload: unknown; dive_date: string | null }>`
          select distinct on (s.user_id) s.user_id, s.payload, s.dive_date::text as dive_date
          from submissions s
          where s.club_id = ${profile.clubId}
            and s.status = 'inviato'
            and s.form_key = 'registro-immersione'
          order by s.user_id, s.created_at desc, s.id desc
        `
      : [];
    const giornoRows = ultimeSchede.filter((row) => schedaCopreGiorno(row.payload, row.dive_date, giorno));
    const archivioRows = await sql<{
      user_id: string;
      nome: string;
      cognome: string;
    }>`
      select distinct on (p.user_id) p.user_id, p.nome, p.cognome
      from submissions s
      join profiles p on p.user_id = s.user_id
      where s.club_id = ${profile.clubId} and s.status = 'inviato'
      order by p.user_id
    `;
    const ids = [...new Set([...giornoRows.map((row) => row.user_id), ...archivioRows.map((row) => row.user_id)])];
    const carte = ids.length
      ? await sql.query<{
          user_id: string;
          id: number;
          titolo: string;
          ente: string;
          livello: string;
          numero: string;
          note: string;
          giorno: string | null;
        }>(
          `select user_id, id, titolo, ente, livello, numero, note,
                  coalesce(rilascio::text, to_char(created_at, 'YYYY-MM-DD')) as giorno
           from brevetti
           where user_id = any($1::text[])`,
          [ids],
        )
      : [];
    const moduli = ids.length
      ? await sql.query<{ user_id: string; id: number; payload: unknown; dive_date: string | null; giorno: string | null }>(
          `select user_id, id, payload, dive_date::text as dive_date, to_char(created_at, 'YYYY-MM-DD') as giorno
           from submissions
           where club_id = $1 and status = 'inviato' and form_key = 'brevetto-esperienza' and user_id = any($2::text[])`,
          [profile.clubId, ids],
        )
      : [];
    const schede = ids.length
      ? await sql.query<{ user_id: string; payload: unknown }>(
          `select distinct on (user_id) user_id, payload
           from submissions
           where club_id = $1 and status = 'inviato'
             and form_key in ('registro-immersione', 'scheda-cliente')
             and user_id = any($2::text[])
           order by user_id, case when dive_date::text = $3 then 0 else 1 end, id desc`,
          [profile.clubId, ids, giorno],
        )
      : [];
    const specificaDi = new Map(schede.map((row) => [row.user_id, specificaDidattica(row.payload)]));
    const carteDi = new Map<string, typeof carte>();
    for (const row of carte) {
      const list = carteDi.get(row.user_id);
      if (list) list.push(row);
      else carteDi.set(row.user_id, [row]);
    }
    const moduliDi = new Map<string, typeof moduli>();
    for (const row of moduli) {
      const list = moduliDi.get(row.user_id);
      if (list) list.push(row);
      else moduliDi.set(row.user_id, [row]);
    }
    const persona = (row: { user_id: string; nome: string; cognome: string }): CandidatoUscita | null => {
      const modulo = scegliModuloBrevetto(moduliDi.get(row.user_id) ?? []);
      if (modulo) {
        const campi = campiModuloBrevetto(modulo.payload);
        return {
          userId: row.user_id,
          nome: row.nome,
          cognome: row.cognome,
          didattica: campi.didattica,
          livello: campi.livello,
          numero: campi.numero,
          fonte: "modulo",
          dataBrevetto: dataModuloBrevetto(modulo.dive_date, modulo.giorno, modulo.payload),
          nomeBrevetto: campi.livello || campi.didattica || "Brevetto",
          profondita: campi.profondita,
          didatticaSpecifica: specificaDi.get(row.user_id) ?? "",
          periodoInizio: "",
          periodoFine: "",
        };
      }
      const voci: VoceBrevetto[] = [
        ...(carteDi.get(row.user_id) ?? []).map((carta) => ({
          nome: carta.titolo.trim() || carta.livello.trim() || carta.ente.trim() || "Brevetto",
          didattica: carta.ente || carta.titolo,
          livello: carta.livello || (carta.ente ? carta.titolo : ""),
          numero: carta.numero,
          fonte: "area" as const,
          data: carta.giorno?.slice(0, 10) ?? "",
          profondita: [carta.note, carta.titolo, carta.livello].reduce<number | null>((best, text) => {
            const n = metriNelTesto(text ?? "");
            if (n == null) return best;
            return best == null || n > best ? n : best;
          }, null),
          ordine: Number(carta.id),
        })),
        ...(moduliDi.get(row.user_id) ?? []).map((modulo) => {
          const payload = oggettoPayload(modulo.payload);
          const didattica = testoCampo(payload, "didattica");
          const livello = testoCampo(payload, "livello");
          const rilascio = testoCampo(payload, "data_rilascio");
          return {
            nome: livello || didattica || "Brevetto",
            didattica,
            livello,
            numero: testoCampo(payload, "numero_brevetto"),
            fonte: "modulo" as const,
            data: /^\d{4}-\d{2}-\d{2}$/.test(rilascio) ? rilascio : (modulo.giorno?.slice(0, 10) ?? ""),
            profondita: metriIndicati(testoCampo(payload, "profondita_massima")),
            ordine: Number(modulo.id),
          };
        }),
      ];
      const scelta = scegliBrevetto(voci);
      if (!scelta) return null;
      return {
        userId: row.user_id,
        nome: row.nome,
        cognome: row.cognome,
        didattica: scelta.didattica,
        livello: scelta.livello,
        numero: scelta.numero,
        fonte: scelta.fonte,
        dataBrevetto: scelta.data,
        nomeBrevetto: scelta.nome,
        profondita: scelta.profondita,
        didatticaSpecifica: specificaDi.get(row.user_id) ?? "",
        periodoInizio: "",
        periodoFine: "",
      };
    };
    const ordina = (items: CandidatoUscita[]) =>
      items.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, "it"));
    const presenti = (rows: { user_id: string; nome: string; cognome: string }[]) =>
      ordina(rows.flatMap((row) => {
        const item = persona(row);
        return item ? [item] : [];
      }));
    const delGiorno = ordina(giornoRows.flatMap((row) => {
      const campi = campiSchedaSubacqueo(row.payload);
      if (!campi) return [];
      const periodo = periodoIndicato(row.payload);
      const item: CandidatoUscita = {
        userId: row.user_id,
        nome: campi.nome,
        cognome: campi.cognome,
        didattica: campi.didattica,
        livello: campi.livello,
        numero: campi.numero,
        fonte: "modulo",
        dataBrevetto: "",
        nomeBrevetto: campi.livello || campi.didattica || "Brevetto",
        profondita: metriIndicati(testoCampo(oggettoPayload(row.payload), "profondita_massima")),
        didatticaSpecifica: "",
        periodoInizio: periodo?.inizio ?? "",
        periodoFine: periodo?.fine ?? "",
      };
      return [item];
    }));
    return {
      delGiorno,
      archivio: presenti(archivioRows),
    };
  });

export type RigaFoglio = {
  cognome: string;
  nome: string;
  didattica: string;
  livello: string;
  numeroBrevetto: string;
  allievo: boolean;
  profonditaMassima: number | null;
};

export type FoglioBarca = {
  data: string;
  uscita: string;
  ora: string;
  righe: RigaFoglio[];
};

async function profonditaDei(sql: Sql, clubId: number, userIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!userIds.length) return out;
  const carte = await sql.query<{
    user_id: string;
    id: number;
    titolo: string;
    ente: string;
    livello: string;
    numero: string;
    note: string;
  }>(
    `select user_id, id, titolo, ente, livello, numero, note from brevetti where user_id = any($1::text[])`,
    [userIds],
  );
  const moduli = await sql.query<{ user_id: string; id: number; payload: unknown }>(
    `select user_id, id, payload from submissions
     where club_id = $1 and status = 'inviato' and form_key = 'brevetto-esperienza' and user_id = any($2::text[])`,
    [clubId, userIds],
  );
  const carteDi = new Map<string, typeof carte>();
  for (const row of carte) {
    const list = carteDi.get(row.user_id);
    if (list) list.push(row);
    else carteDi.set(row.user_id, [row]);
  }
  const moduliDi = new Map<string, typeof moduli>();
  for (const row of moduli) {
    const list = moduliDi.get(row.user_id);
    if (list) list.push(row);
    else moduliDi.set(row.user_id, [row]);
  }
  for (const userId of userIds) {
    const voci: VoceBrevetto[] = [
      ...(carteDi.get(userId) ?? []).map((carta) => ({
        nome: carta.titolo.trim() || "Brevetto",
        didattica: carta.ente,
        livello: carta.livello,
        numero: carta.numero,
        fonte: "area" as const,
        data: "",
        profondita: [carta.note, carta.titolo, carta.livello].reduce<number | null>((best, text) => {
          const n = metriNelTesto(text ?? "");
          if (n == null) return best;
          return best == null || n > best ? n : best;
        }, null),
        ordine: Number(carta.id),
      })),
      ...(moduliDi.get(userId) ?? []).map((modulo) => {
        const payload = oggettoPayload(modulo.payload);
        return {
          nome: "Brevetto",
          didattica: "",
          livello: "",
          numero: "",
          fonte: "modulo" as const,
          data: "",
          profondita: metriIndicati(testoCampo(payload, "profondita_massima")),
          ordine: Number(modulo.id),
        };
      }),
    ];
    out.set(userId, scegliBrevetto(voci)?.profondita ?? null);
  }
  return out;
}

export const listaFoglioBarca = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<FoglioBarca> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const uscita = await loadUscita(sql, clubId, data.id);
    const ids = [...new Set(uscita.righe.flatMap((row) => (row.userId && !row.allievo ? [row.userId] : [])))];
    const profondita = await profonditaDei(sql, clubId, ids);
    return {
      data: uscita.data,
      uscita: [uscita.imbarcazione, uscita.localita, uscita.punto].filter(Boolean).join(" · "),
      ora: uscita.orarioInizio,
      righe: uscita.righe.map((row) => ({
        cognome: row.cognome,
        nome: row.nome,
        didattica: row.didattica,
        livello: row.livello,
        numeroBrevetto: row.numeroBrevetto,
        allievo: row.allievo,
        profonditaMassima: row.userId && !row.allievo ? (profondita.get(row.userId) ?? null) : null,
      })),
    };
  });

function boundsSettimana(oggi: string): { dal: string; al: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(oggi);
  if (!match) return { dal: oggi, al: oggi };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = date.getUTCDay();
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { dal: iso(monday), al: iso(sunday) };
}

export type RiepilogoSettimana = {
  uscite: { data: string; titolo: string; persone: number }[];
  senzaBrevetto: { cognome: string; nome: string }[];
  moduli: { nome: string; modulo: string; creato: string }[];
};

export const riepilogoSettimana = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RiepilogoSettimana> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare vede il riepilogo.");
    const { dal, al } = boundsSettimana(todayRome());
    const uscite = await sql<{ data: string; localita: string; imbarcazione: string; persone: number }>`
      select u.data::text as data, u.localita, u.imbarcazione,
             (select count(*)::int from uscita_righe r where r.uscita_id = u.id) as persone
      from uscite u
      where u.club_id = ${club.id} and u.data between ${dal}::date and ${al}::date
      order by u.data, u.id
    `;
    const sulFoglio = await sql<{ cognome: string; nome: string }>`
      select distinct r.cognome, r.nome
      from uscita_righe r
      join uscite u on u.id = r.uscita_id
      where u.club_id = ${club.id}
        and u.data between ${dal}::date and ${al}::date
        and (r.allievo or btrim(r.numero_brevetto) = '')
    `;
    const senzaModulo = await sql<{ cognome: string; nome: string }>`
      select distinct p.cognome, p.nome
      from submissions s
      join profiles p on p.user_id = s.user_id
      where s.club_id = ${club.id}
        and s.status = 'inviato'
        and s.form_key in ('registro-immersione', 'scheda-cliente')
        and s.dive_date between ${dal}::date and ${al}::date
        and not exists (
          select 1 from brevetti b
          where b.user_id = p.user_id and btrim(coalesce(b.numero, '')) <> ''
        )
        and not exists (
          select 1 from submissions m
          where m.user_id = p.user_id
            and m.club_id = s.club_id
            and m.status = 'inviato'
            and m.form_key = 'brevetto-esperienza'
            and btrim(coalesce(m.payload->>'numero_brevetto', '')) <> ''
        )
    `;
    const moduli = await sql<{ subject_name: string; form_key: string; creato: string }>`
      select subject_name, form_key, to_char(created_at, 'YYYY-MM-DD') as creato
      from submissions
      where club_id = ${club.id}
        and status = 'inviato'
        and letto_il is null
        and created_at::date between ${dal}::date and ${al}::date
      order by created_at desc
    `;
    const visti = new Set<string>();
    const senzaBrevetto: { cognome: string; nome: string }[] = [];
    for (const row of [...sulFoglio, ...senzaModulo]) {
      const chiave = `${row.cognome} ${row.nome}`.trim().toLowerCase();
      if (!chiave || visti.has(chiave)) continue;
      visti.add(chiave);
      senzaBrevetto.push({ cognome: row.cognome, nome: row.nome });
    }
    senzaBrevetto.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, "it"));
    return {
      uscite: uscite.map((row) => ({
        data: row.data.slice(0, 10),
        titolo: [row.imbarcazione, row.localita].filter(Boolean).join(" · "),
        persone: Number(row.persone) || 0,
      })),
      senzaBrevetto,
      moduli: moduli.map((row) => ({
        nome: row.subject_name,
        modulo: formByKey(row.form_key)?.title ?? "",
        creato: row.creato,
      })),
    };
  });

const GIORNI_CORTI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const MESI_CORTI = ["Gen", "Feb", "Mar.", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"] as const;

function isoUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dataUtc(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function boundsPeriodo(oggi: string, periodo: "giorno" | "settimana" | "mese" | "anno"): { dal: string; al: string } {
  if (periodo === "giorno") return { dal: oggi, al: oggi };
  if (periodo === "settimana") return boundsSettimana(oggi);
  const date = dataUtc(oggi);
  if (periodo === "mese") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { dal: isoUtc(start), al: isoUtc(end) };
  }
  const year = date.getUTCFullYear();
  return { dal: `${year}-01-01`, al: `${year}-12-31` };
}

function periodoPrima(dal: string, periodo: "giorno" | "settimana" | "mese" | "anno"): { dal: string; al: string } {
  const start = dataUtc(dal);
  if (periodo === "giorno") {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() - 1);
    const iso = isoUtc(day);
    return { dal: iso, al: iso };
  }
  if (periodo === "settimana") {
    const monday = new Date(start);
    monday.setUTCDate(monday.getUTCDate() - 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { dal: isoUtc(monday), al: isoUtc(sunday) };
  }
  if (periodo === "mese") {
    const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const prevEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return { dal: isoUtc(prevStart), al: isoUtc(prevEnd) };
  }
  const year = start.getUTCFullYear() - 1;
  return { dal: `${year}-01-01`, al: `${year}-12-31` };
}

function dentro(giorno: string, dal: string, al: string): boolean {
  const day = giorno.slice(0, 10);
  return day >= dal && day <= al;
}

function minutiTra(inizio: string, fine: string): number | null {
  const a = /^(\d{2}):(\d{2})/.exec(inizio.trim());
  const b = /^(\d{2}):(\d{2})/.exec(fine.trim());
  if (!a || !b) return null;
  const da = Number(a[1]) * 60 + Number(a[2]);
  const aFine = Number(b[1]) * 60 + Number(b[2]);
  if (aFine < da) return null;
  return aFine - da;
}

function variazione(ora: number, prima: number): number | null {
  if (prima === 0) return ora === 0 ? 0 : null;
  return Math.round(((ora - prima) / prima) * 100);
}

function indiceSettimana(iso: string): number {
  const day = dataUtc(iso).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export type GraficiScuola = {
  dal: string;
  al: string;
  immersioni: number;
  subacquei: number;
  uscite: number;
  moduli: number;
  minuti: number;
  delta: { immersioni: number | null; subacquei: number | null; uscite: number | null; moduli: number | null; minuti: number | null };
  barre: { chiave: string; uscite: number }[];
  torta: { ricreative: number; tecniche: number };
  guide: { nome: string; immersioni: number }[];
  sociAnni: { anno: number; n: number }[];
  sociMesi: { chiave: string; n: number }[];
};

export const graficiScuola = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): { periodo: "giorno" | "settimana" | "mese" | "anno" } => {
    const periodo = (input as { periodo?: unknown } | null)?.periodo;
    if (periodo !== "giorno" && periodo !== "settimana" && periodo !== "mese" && periodo !== "anno") throw new Error("Periodo non valido.");
    return { periodo };
  })
  .handler(async ({ context, data }): Promise<GraficiScuola> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const club = await loadClubById(sql, profile.clubId!);
    if (!club) throw new Error("Solo titolare e staff vedono le statistiche.");
    const oggi = todayRome();
    const corrente = boundsPeriodo(oggi, data.periodo);
    const prima = periodoPrima(corrente.dal, data.periodo);
    const uscite = await sql<{ id: number; data: string }>`
      select id, data::text as data
      from uscite
      where club_id = ${club.id} and data between ${prima.dal}::date and ${corrente.al}::date
    `;
    const righe = await sql<{
      data: string;
      orario_inizio: string;
      guida_nome: string | null;
      passaggio: boolean | string | null;
      user_id: string | null;
      cognome: string | null;
      nome: string | null;
      orario_fine: string | null;
    }>`
      select u.data::text as data, u.orario_inizio, g.guida_nome, g.passaggio, r.user_id, r.cognome, r.nome, r.orario_fine
      from uscita_righe r
      join uscite u on u.id = r.uscita_id
      left join uscita_gruppi g on g.id = r.gruppo_id
      where u.club_id = ${club.id} and u.data between ${prima.dal}::date and ${corrente.al}::date
    `;
    const moduli = await sql<{ giorno: string; n: number }>`
      select to_char(created_at at time zone 'Europe/Rome', 'YYYY-MM-DD') as giorno, count(*)::int as n
      from submissions
      where club_id = ${club.id}
        and status = 'inviato'
        and (created_at at time zone 'Europe/Rome')::date between ${prima.dal}::date and ${corrente.al}::date
      group by 1
    `;
    const tipi = await sql<{ tipo: string; n: number }>`
      select coalesce(payload->>'tipo_attivita', '') as tipo, count(*)::int as n
      from submissions
      where club_id = ${club.id}
        and status = 'inviato'
        and form_key in ('registro-immersione', 'scheda-cliente')
        and dive_date between ${corrente.dal}::date and ${corrente.al}::date
      group by 1
    `;

    function misura(dal: string, al: string) {
      const fogli = uscite.filter((row) => dentro(row.data, dal, al));
      const persone = righe.filter((row) => dentro(row.data, dal, al));
      const visti = new Set<string>();
      let minuti = 0;
      for (const row of persone) {
        const nome = `${row.cognome ?? ""} ${row.nome ?? ""}`.trim().toLowerCase();
        const chiave = (row.user_id ?? "").trim() || nome;
        if (chiave) visti.add(chiave);
        const tratto = minutiTra(row.orario_inizio ?? "", row.orario_fine ?? "");
        if (tratto != null) minuti += tratto;
      }
      const moduliN = moduli.reduce((sum, row) => (dentro(row.giorno, dal, al) ? sum + Number(row.n) : sum), 0);
      return { immersioni: persone.length, subacquei: visti.size, uscite: fogli.length, moduli: moduliN, minuti };
    }

    const ora = misura(corrente.dal, corrente.al);
    const scorso = misura(prima.dal, prima.al);
    const perGiorno = new Map<string, number>();
    for (const row of uscite) {
      const day = row.data.slice(0, 10);
      if (!dentro(day, corrente.dal, corrente.al)) continue;
      perGiorno.set(day, (perGiorno.get(day) ?? 0) + 1);
    }
    let barre: { chiave: string; uscite: number }[];
    if (data.periodo === "anno") {
      barre = MESI_CORTI.map((chiave, index) => {
        const mese = String(index + 1).padStart(2, "0");
        let n = 0;
        for (const [day, count] of perGiorno) if (day.slice(5, 7) === mese) n += count;
        return { chiave, uscite: n };
      });
    } else if (data.periodo === "mese") {
      const giorni = dataUtc(corrente.al).getUTCDate();
      barre = Array.from({ length: giorni }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        const iso = `${corrente.dal.slice(0, 8)}${day}`;
        return { chiave: String(index + 1), uscite: perGiorno.get(iso) ?? 0 };
      });
    } else if (data.periodo === "settimana") {
      barre = GIORNI_CORTI.map((chiave, index) => {
        const date = dataUtc(corrente.dal);
        date.setUTCDate(date.getUTCDate() + index);
        return { chiave, uscite: perGiorno.get(isoUtc(date)) ?? 0 };
      });
    } else {
      barre = [{ chiave: GIORNI_CORTI[indiceSettimana(corrente.dal)] ?? "Lun", uscite: perGiorno.get(corrente.dal) ?? 0 }];
    }
    const guideConteggio = new Map<string, { nome: string; immersioni: number }>();
    for (const row of righe) {
      if (!dentro(row.data, corrente.dal, corrente.al) || asBool(row.passaggio)) continue;
      const nome = (row.guida_nome ?? "").trim();
      if (!nome) continue;
      const chiave = nome.toLocaleLowerCase("it");
      const voce = guideConteggio.get(chiave) ?? { nome, immersioni: 0 };
      voce.immersioni += 1;
      guideConteggio.set(chiave, voce);
    }
    const guide = [...guideConteggio.values()].sort((a, b) => b.immersioni - a.immersioni || a.nome.localeCompare(b.nome, "it")).slice(0, 8);
    const torta = { ricreative: 0, tecniche: 0 };
    for (const row of tipi) {
      if (row.tipo === "Ricreativa") torta.ricreative += Number(row.n) || 0;
      if (row.tipo === "Tecnica") torta.tecniche += Number(row.n) || 0;
    }
    const annoSoci = Number(oggi.slice(0, 4));
    const sociRighe = await sql<{ anno: number; mese: number; n: number }>`
      select anno, extract(month from accettato_il at time zone 'Europe/Rome')::int as mese, count(*)::int as n
      from soci
      where club_id = ${club.id} and stato = 'accettato' and rimosso_il is null and accettato_il is not null
      group by anno, mese
    `;
    const perAnno = new Map<number, number>();
    const perMese = new Map<number, number>();
    for (const row of sociRighe) {
      const anno = Number(row.anno);
      const n = Number(row.n) || 0;
      perAnno.set(anno, (perAnno.get(anno) ?? 0) + n);
      if (anno === annoSoci) perMese.set(Number(row.mese), n);
    }
    const sociAnni = [...perAnno.entries()].sort((a, b) => a[0] - b[0]).map(([anno, n]) => ({ anno, n }));
    const sociMesi = MESI_CORTI.map((chiave, index) => ({ chiave, n: perMese.get(index + 1) ?? 0 }));
    return {
      dal: corrente.dal,
      al: corrente.al,
      ...ora,
      delta: {
        immersioni: variazione(ora.immersioni, scorso.immersioni),
        subacquei: variazione(ora.subacquei, scorso.subacquei),
        uscite: variazione(ora.uscite, scorso.uscite),
        moduli: variazione(ora.moduli, scorso.moduli),
        minuti: variazione(ora.minuti, scorso.minuti),
      },
      barre,
      torta,
      guide,
      sociAnni,
      sociMesi,
    };
  });

export const listUscite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: number; data: string; localita: string; imbarcazione: string; guidaNome: string; persone: number; fase: "prima" | "dopo" | "chiusa"; viaggioId: number | null }[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    await requireScuolaAperta(sql, profile);
    const rows = await sql<{
      id: number;
      data: string;
      localita: string;
      imbarcazione: string;
      guida_nome: string;
      persone: number;
      chiusa_prima: string | null;
      chiusa_dopo: string | null;
      viaggio_id: number | null;
    }>`
      select u.id, u.data::text as data, u.localita, u.imbarcazione,
             coalesce(
               (select string_agg(g.guida_nome, ', ' order by g.id) from uscita_gruppi g where g.uscita_id = u.id),
               u.guida_nome
             ) as guida_nome,
             (select count(*)::int from uscita_righe r where r.uscita_id = u.id) as persone,
             u.chiusa_prima::text as chiusa_prima, u.chiusa_dopo::text as chiusa_dopo, u.viaggio_id
      from uscite u
      where u.club_id = ${profile.clubId}
      order by u.data desc, u.id desc
      limit 40
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      data: row.data.slice(0, 10),
      localita: row.localita,
      imbarcazione: row.imbarcazione,
      guidaNome: row.guida_nome,
      persone: Number(row.persone),
      fase: row.chiusa_dopo ? "chiusa" : row.chiusa_prima ? "dopo" : "prima",
      viaggioId: row.viaggio_id == null ? null : Number(row.viaggio_id),
    }));
  });

export const getUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    await requireScuolaAperta(sql, profile);
    if (!profile.clubId) throw new Error("Nessuna scuola.");
    return loadUscita(sql, profile.clubId, data.id);
  });

export const creaUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const data = asText(raw.data).slice(0, 10);
    const localita = asText(raw.localita).trim().slice(0, 120);
    const punto = asText(raw.punto).trim().slice(0, 120);
    const orarioInizio = asText(raw.orarioInizio).trim().slice(0, 8);
    const daRiva = raw.daRiva === true;
    const imbarcazioneId = Number(raw.imbarcazioneId);
    const guideIds = [...new Set((Array.isArray(raw.guideIds) ? raw.guideIds : []).map((item) => asText(item).trim()).filter(Boolean))];
    const passaggio = raw.passaggio === true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Controlla la data.");
    if (!localita) throw new Error("Scrivi la località.");
    if (!/^\d{2}:\d{2}$/.test(orarioInizio)) throw new Error("Scrivi l'orario di inizio.");
    if (!daRiva && (!Number.isInteger(imbarcazioneId) || imbarcazioneId <= 0)) throw new Error("Scegli l'imbarcazione.");
    if (!guideIds.length && !passaggio) throw new Error("Scegli almeno una guida, oppure il solo passaggio.");
    return { data, localita, punto, orarioInizio, daRiva, imbarcazioneId: daRiva ? 0 : imbarcazioneId, guideIds, passaggio };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    await requireScuolaAperta(sql, profile);
    const clubId = profile.clubId ?? 0;
    const club = await loadClubById(sql, clubId);
    const nautico = club ? (club.mezzo_nautico == null ? true : asBool(club.mezzo_nautico)) : true;
    if (!nautico && (!data.daRiva || data.guideIds.length)) throw new Error("Questa scuola non ha un mezzo nautico.");
    let imbarcazione = "Da riva";
    let imbarcazioneId: number | null = null;
    if (!data.daRiva) {
      const barche = await sql<{ id: number; nome: string }>`
        select id, nome from imbarcazioni where id = ${data.imbarcazioneId} and club_id = ${clubId} limit 1
      `;
      const barca = barche[0];
      if (!barca) throw new Error("Questa imbarcazione non è della scuola.");
      imbarcazione = barca.nome;
      imbarcazioneId = Number(barca.id);
    }
    const persone = await listGuideRows(sql, clubId);
    const scelte = data.guideIds.map((userId) => {
      const guida = persone.find((person) => person.userId === userId);
      if (!guida) throw new Error("Una guida non è dello staff.");
      if (!guida.puoUscire) throw new Error(`${guida.cognome} ${guida.nome} non può uscire. ${guida.motivo}.`);
      return guida;
    });
    const nomi = [
      ...scelte.map((guida) => `${guida.cognome} ${guida.nome}`.trim()),
      ...(data.passaggio ? ["Solo passaggio"] : []),
    ];
    const rows = await sql<{ id: number }>`
      insert into uscite (club_id, data, localita, punto, imbarcazione, imbarcazione_id, guida_user_id, guida_nome, orario_inizio, created_by)
      values (${clubId}, ${data.data}, ${data.localita}, ${data.punto}, ${imbarcazione}, ${imbarcazioneId}, ${null}, ${nomi.join(", ")}, ${data.orarioInizio}, ${context.userId})
      returning id
    `;
    const id = Number(rows[0]?.id);
    if (!id) throw new Error("Non riesco ad aprire l'uscita.");
    for (const guida of scelte) {
      const nome = `${guida.cognome} ${guida.nome}`.trim();
      await sql`
        insert into uscita_gruppi (uscita_id, guida_user_id, guida_nome, passaggio)
        values (${id}, ${guida.userId}, ${nome}, ${false})
      `;
    }
    if (data.passaggio) {
      await sql`
        insert into uscita_gruppi (uscita_id, guida_user_id, guida_nome, passaggio)
        values (${id}, ${null}, ${"Solo passaggio"}, ${true})
      `;
    }
    return { id };
  });

export const eliminaGiornata = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const rows = await sql<{ data: string; chiusa_dopo: string | null; viaggio_id: number | null }>`
      select data::text as data, chiusa_dopo::text as chiusa_dopo, viaggio_id from uscite where id = ${data.id} and club_id = ${clubId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Uscita non trovata.");
    if (row.viaggio_id && !mesiCompiuti(row.data.slice(0, 10), todayRome())) {
      throw new Error("Il registro di un viaggio resta per sei mesi.");
    }
    if (!row.chiusa_dopo) {
      await sql`delete from uscite where id = ${data.id} and club_id = ${clubId}`;
      return { ok: true };
    }
    const club = await loadClubById(sql, clubId);
    if (!club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare può cancellare un registro già chiuso.");
    await sql`delete from uscite where id = ${data.id} and club_id = ${clubId}`;
    return { ok: true };
  });

async function listGuideRows(sql: Sql, clubId: number): Promise<GuidaUscita[]> {
  const people = await sql<{ user_id: string; nome: string; cognome: string }>`
    select p.user_id, p.nome, p.cognome
    from profiles p
    where p.user_id in (
        select owner_user_id from club where id = ${clubId}
        union
        select co_owner_user_id from club where id = ${clubId}
      )
       or p.user_id in (select user_id from staff_membri where club_id = ${clubId})
    order by p.cognome, p.nome
  `;
  const ids = people.map((person) => person.user_id);
  const docs = ids.length
    ? await sql.query<DocRow>(
        `select user_id, kind, scadenza::text as scadenza from documenti_personali where user_id = any($1::text[]) and kind in ('medico', 'assicurazione')`,
        [ids],
      )
    : [];
  const oggi = todayRome();
  return people.map((person) => {
    const motivo = motivoGuida(docs, person.user_id, oggi);
    return { userId: person.user_id, nome: person.nome, cognome: person.cognome, puoUscire: motivo === "", motivo };
  });
}

async function uscitaAperta(sql: Sql, clubId: number, id: number, fase: "prima" | "dopo") {
  const rows = await sql<{ chiusa_prima: string | null; chiusa_dopo: string | null }>`
    select chiusa_prima::text as chiusa_prima, chiusa_dopo::text as chiusa_dopo
    from uscite where id = ${id} and club_id = ${clubId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Uscita non trovata.");
  if (fase === "prima" && row.chiusa_prima) throw new Error("La verifica dei brevetti è già chiusa.");
  if (fase === "dopo" && !row.chiusa_prima) throw new Error("Prima chiudi la verifica dei brevetti.");
  if (fase === "dopo" && row.chiusa_dopo) throw new Error("Il registro è già chiuso.");
}

export const aggiungiPartecipante = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const userId = asText(raw.userId).trim();
    const cognome = asText(raw.cognome).trim().slice(0, 80);
    const nome = asText(raw.nome).trim().slice(0, 80);
    const didattica = asText(raw.didattica).trim().slice(0, 80);
    const livello = asText(raw.livello).trim().slice(0, 80);
    const numero = asText(raw.numero).trim().slice(0, 80);
    const allievo = raw.allievo === true;
    const gruppoId = Number(raw.gruppoId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    if (!Number.isInteger(gruppoId) || gruppoId <= 0) throw new Error("Scegli la guida.");
    if (!userId && !allievo && (!cognome || !nome || !numero)) throw new Error("Servono cognome, nome e numero di brevetto.");
    if (allievo && (!cognome || !nome)) throw new Error("Per un allievo servono cognome e nome.");
    return { id, gruppoId, userId, cognome, nome, didattica, livello, numero, allievo };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    await uscitaAperta(sql, clubId, data.id, "prima");
    const gruppi = await sql<{ id: number }>`
      select id from uscita_gruppi where id = ${data.gruppoId} and uscita_id = ${data.id} limit 1
    `;
    if (!gruppi[0]) throw new Error("Questa guida non è sull'uscita.");
    let cognome = data.cognome;
    let nome = data.nome;
    let didattica = data.didattica;
    let livello = data.livello;
    let numero = data.numero;
    let userId: string | null = data.userId || null;
    if (userId) {
      const people = await sql<{ nome: string; cognome: string }>`
        select nome, cognome from profiles where user_id = ${userId} limit 1
      `;
      const person = people[0];
      if (!person) throw new Error("Subacqueo non trovato.");
      cognome = person.cognome;
      nome = person.nome;
      if (!data.allievo) {
        const uscite = await sql<{ data: string }>`
          select data::text as data from uscite where id = ${data.id} and club_id = ${clubId} limit 1
        `;
        const giorno = uscite[0]?.data?.slice(0, 10) ?? "";
        const schede = giorno
          ? await sql<{ payload: unknown; dive_date: string | null }>`
              select payload, dive_date::text as dive_date from submissions
              where club_id = ${clubId} and user_id = ${userId} and status = 'inviato'
                and form_key = 'registro-immersione'
              order by created_at desc, id desc
              limit 1
            `
          : [];
        const ultima = schede[0] && schedaCopreGiorno(schede[0].payload, schede[0].dive_date, giorno) ? schede[0] : null;
        const scheda = ultima ? campiSchedaSubacqueo(ultima.payload) : null;
        if (scheda) {
          if (scheda.cognome) cognome = scheda.cognome;
          if (scheda.nome) nome = scheda.nome;
          didattica = scheda.didattica;
          livello = scheda.livello;
          numero = scheda.numero;
        } else {
          const inviati = await sql<{ id: number; payload: unknown; dive_date: string | null; giorno: string | null }>`
            select id, payload, dive_date::text as dive_date, to_char(created_at, 'YYYY-MM-DD') as giorno
            from submissions
            where club_id = ${clubId} and user_id = ${userId} and status = 'inviato' and form_key = 'brevetto-esperienza'
          `;
          const modulo = scegliModuloBrevetto(inviati);
          if (modulo) {
            const campi = campiModuloBrevetto(modulo.payload);
            didattica = campi.didattica;
            livello = campi.livello;
            numero = campi.numero;
          } else {
            const cards = await sql<{ ente: string | null; livello: string | null; numero: string | null }>`
              select ente, livello, numero from brevetti where user_id = ${userId} order by id desc limit 1
            `;
            const carta = cards[0];
            if (carta?.numero) {
              didattica = carta.ente ?? "";
              livello = carta.livello ?? "";
              numero = carta.numero;
            } else if (data.numero) {
              didattica = data.didattica;
              livello = data.livello;
              numero = data.numero;
            } else {
              throw new Error("Questo subacqueo non ha un brevetto in archivio. Aggiungilo come allievo.");
            }
          }
        }
      }
    }
    const gia = await sql<{ id: number }>`
      select id from uscita_righe
      where uscita_id = ${data.id}
        and (
          (${userId}::text is not null and user_id = ${userId})
          or (lower(cognome) = lower(${cognome}) and lower(nome) = lower(${nome}))
        )
      limit 1
    `;
    if (gia[0]) throw new Error("Questa persona è già su un'altra guida di questa uscita.");
    await sql`
      insert into uscita_righe (uscita_id, gruppo_id, user_id, cognome, nome, didattica, livello, numero_brevetto, allievo)
      values (${data.id}, ${data.gruppoId}, ${userId}, ${cognome}, ${nome}, ${didattica}, ${livello}, ${data.allievo ? "" : numero}, ${data.allievo})
    `;
    return loadUscita(sql, clubId, data.id);
  });

export const togliPartecipante = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const rigaId = Number(raw.rigaId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(rigaId) || rigaId <= 0) throw new Error("Riga non valida.");
    return { id, rigaId };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    await uscitaAperta(sql, clubId, data.id, "prima");
    await sql`delete from uscita_righe where id = ${data.rigaId} and uscita_id = ${data.id}`;
    return loadUscita(sql, clubId, data.id);
  });

export const chiudiVerifica = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    if (!Array.isArray(raw.motivi)) throw new Error("Dati mancanti.");
    const motivi = raw.motivi.map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const gruppoId = Number(row.gruppoId);
      if (!Number.isInteger(gruppoId) || gruppoId <= 0) throw new Error("Guida non valida.");
      return { gruppoId, motivo: asText(row.motivo).trim().slice(0, 400) };
    });
    return { id, motivi };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    await uscitaAperta(sql, clubId, data.id, "prima");
    const uscita = await loadUscita(sql, clubId, data.id);
    if (!uscita.gruppi.length) throw new Error("Su questa uscita non ci sono guide.");
    if (!uscita.righe.length) throw new Error("Aggiungi almeno un subacqueo.");
    if (uscita.righe.some((row) => !row.allievo && !row.numeroBrevetto.trim())) throw new Error("Manca il numero di brevetto di un partecipante.");
    const note: string[] = [];
    for (const gruppo of uscita.gruppi) {
      if (!gruppo.righe.length) throw new Error(`A ${gruppo.guidaNome} non hai assegnato nessuno. Toglila, oppure aggiungi i subacquei.`);
      if (gruppo.righe.length > 6) {
        const motivo = data.motivi.find((item) => item.gruppoId === gruppo.id)?.motivo ?? "";
        if (motivo.length < 8) throw new Error(`Oltre 6 subacquei per ${gruppo.guidaNome}. Scrivi perché, almeno una frase.`);
        await sql`update uscita_gruppi set motivo_rapporto = ${motivo} where id = ${gruppo.id} and uscita_id = ${data.id}`;
        note.push(`${gruppo.guidaNome}: ${motivo}`);
      }
    }
    await sql`
      update uscite set motivo_rapporto = ${note.join(" ")}, chiusa_prima = now()
      where id = ${data.id} and club_id = ${clubId}
    `;
    return loadUscita(sql, clubId, data.id);
  });

export const chiudiRegistro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    if (!Array.isArray(raw.righe)) throw new Error("Dati mancanti.");
    const righe = raw.righe.map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const rigaId = Number(row.id);
      if (!Number.isInteger(rigaId) || rigaId <= 0) throw new Error("Riga non valida.");
      return {
        id: rigaId,
        orarioFine: asText(row.orarioFine).trim().slice(0, 8),
        profondita: asText(row.profondita).trim().slice(0, 10),
        autorespiratore: asText(row.autorespiratore).trim().slice(0, 40),
        miscela: asText(row.miscela).trim().slice(0, 40),
        percentualeO2: asText(row.percentualeO2).trim().slice(0, 8),
      };
    });
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id, righe };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    await uscitaAperta(sql, clubId, data.id, "dopo");
    const nomi = await sql<{ id: number; cognome: string; nome: string }>`
      select id, cognome, nome from uscita_righe where uscita_id = ${data.id}
    `;
    for (const row of data.righe) {
      const mancano: string[] = [];
      if (!/^\d{2}:\d{2}$/.test(row.orarioFine)) mancano.push("orario di fine");
      if (!row.profondita) mancano.push("profondità");
      if (!row.autorespiratore) mancano.push("autorespiratore");
      if (!row.miscela) mancano.push("miscela");
      if (mancano.length) {
        const who = nomi.find((item) => Number(item.id) === row.id);
        const persona = who ? `${who.cognome} ${who.nome}` : "un partecipante";
        throw new Error(`A ${persona} manca ${mancano.join(", ")}.`);
      }
      await sql`
        update uscita_righe
        set orario_fine = ${row.orarioFine}, profondita = ${row.profondita}, autorespiratore = ${row.autorespiratore},
            miscela = ${row.miscela}, percentuale_o2 = ${row.percentualeO2}
        where id = ${row.id} and uscita_id = ${data.id}
      `;
    }
    const uscita = await loadUscita(sql, clubId, data.id);
    if (uscita.righe.length !== data.righe.length) throw new Error("Il registro non è completo.");
    await sql`update uscite set chiusa_dopo = now() where id = ${data.id} and club_id = ${clubId}`;
    return loadUscita(sql, clubId, data.id);
  });

export const riapriRegistro = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const rows = await sql<{ chiusa_dopo: string | null }>`
      select chiusa_dopo::text as chiusa_dopo from uscite where id = ${data.id} and club_id = ${clubId}
    `;
    if (!rows[0]) throw new Error("Uscita non trovata.");
    if (!rows[0].chiusa_dopo) throw new Error("Questo registro non è chiuso.");
    await sql`update uscite set chiusa_prima = null, chiusa_dopo = null where id = ${data.id} and club_id = ${clubId}`;
    return loadUscita(sql, clubId, data.id);
  });

export const aggiornaIntestazioneUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const data = asText(raw.data).slice(0, 10);
    const localita = asText(raw.localita).trim().slice(0, 120);
    const punto = asText(raw.punto).trim().slice(0, 120);
    const orarioInizio = asText(raw.orarioInizio).trim().slice(0, 8);
    const daRiva = raw.daRiva === true;
    const imbarcazioneId = Number(raw.imbarcazioneId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Controlla la data.");
    if (!localita) throw new Error("Scrivi la località.");
    if (!/^\d{2}:\d{2}$/.test(orarioInizio)) throw new Error("Scrivi l'orario di inizio.");
    if (!daRiva && (!Number.isInteger(imbarcazioneId) || imbarcazioneId <= 0)) throw new Error("Scegli l'imbarcazione.");
    return { id, data, localita, punto, orarioInizio, daRiva, imbarcazioneId: daRiva ? 0 : imbarcazioneId };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const club = await loadClubById(sql, clubId);
    const nautico = club ? (club.mezzo_nautico == null ? true : asBool(club.mezzo_nautico)) : true;
    if (!nautico && !data.daRiva) throw new Error("Questa scuola non ha un mezzo nautico.");
    const aperte = await sql<{ chiusa_dopo: string | null }>`
      select chiusa_dopo::text as chiusa_dopo from uscite where id = ${data.id} and club_id = ${clubId}
    `;
    if (!aperte[0]) throw new Error("Uscita non trovata.");
    if (aperte[0].chiusa_dopo) throw new Error("Il registro è già chiuso.");
    let imbarcazione = "Da riva";
    let imbarcazioneId: number | null = null;
    if (!data.daRiva) {
      const barche = await sql<{ id: number; nome: string }>`
        select id, nome from imbarcazioni where id = ${data.imbarcazioneId} and club_id = ${clubId} limit 1
      `;
      const barca = barche[0];
      if (!barca) throw new Error("Questa imbarcazione non è della scuola.");
      imbarcazione = barca.nome;
      imbarcazioneId = Number(barca.id);
    }
    await sql`
      update uscite
      set data = ${data.data}, localita = ${data.localita}, punto = ${data.punto},
          orario_inizio = ${data.orarioInizio}, imbarcazione = ${imbarcazione}, imbarcazione_id = ${imbarcazioneId}
      where id = ${data.id} and club_id = ${clubId}
    `;
    return loadUscita(sql, clubId, data.id);
  });

export const listImbarcazioni = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: number; nome: string }[]> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const rows = await sql<{ id: number; nome: string }>`
      select id, nome from imbarcazioni where club_id = ${profile.clubId} order by nome
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome }));
  });

export const aggiungiImbarcazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const nome = asText((input as { nome?: unknown } | null)?.nome).trim().replace(/\s+/g, " ").slice(0, 60);
    if (nome.length < 2) throw new Error("Scrivi il nome della barca.");
    if (nome.toLowerCase() === "da riva") throw new Error("Da riva c'è già, non va registrata.");
    return { nome };
  })
  .handler(async ({ context, data }): Promise<{ id: number; nome: string }[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare registra le imbarcazioni.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    const gia = await sql<{ id: number }>`
      select id from imbarcazioni where club_id = ${club.id} and lower(nome) = lower(${data.nome}) limit 1
    `;
    if (gia[0]) throw new Error("Questa barca c'è già.");
    await sql`insert into imbarcazioni (club_id, nome) values (${club.id}, ${data.nome})`;
    const rows = await sql<{ id: number; nome: string }>`
      select id, nome from imbarcazioni where club_id = ${club.id} order by nome
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome }));
  });

export const togliImbarcazione = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Barca non valida.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ id: number; nome: string }[]> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    const club = profile?.clubId ? await loadClubById(sql, profile.clubId) : null;
    if (!profile || !club || !eTitolare(club, context.userId)) throw new Error("Solo il titolare toglie le imbarcazioni.");
    if (!abbonamentoDi(profile, club, todayRome()).scuolaAperta) throw new Error("Il diving non è in prova valida né attivo.");
    await sql`delete from imbarcazioni where id = ${data.id} and club_id = ${club.id}`;
    const rows = await sql<{ id: number; nome: string }>`
      select id, nome from imbarcazioni where club_id = ${club.id} order by nome
    `;
    return rows.map((row) => ({ id: Number(row.id), nome: row.nome }));
  });

export const aggiungiGruppoUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const guidaUserId = asText(raw.guidaUserId).trim();
    if (!Number.isInteger(id) || id <= 0) throw new Error("Uscita non valida.");
    if (!guidaUserId) throw new Error("Scegli la guida.");
    return { id, guidaUserId };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const club = await loadClubById(sql, clubId);
    const nautico = club ? (club.mezzo_nautico == null ? true : asBool(club.mezzo_nautico)) : true;
    if (!nautico && data.guidaUserId !== "passaggio") throw new Error("Questa scuola non ha un mezzo nautico.");
    await uscitaAperta(sql, clubId, data.id, "prima");
    const presenti = await sql<{ guida_user_id: string | null; passaggio: boolean }>`
      select guida_user_id, passaggio from uscita_gruppi where uscita_id = ${data.id}
    `;
    if (data.guidaUserId === "passaggio") {
      if (presenti.some((row) => row.passaggio)) throw new Error("Il solo passaggio c'è già.");
      await sql`
        insert into uscita_gruppi (uscita_id, guida_user_id, guida_nome, passaggio)
        values (${data.id}, ${null}, ${"Solo passaggio"}, ${true})
      `;
    } else {
      if (presenti.some((row) => row.guida_user_id === data.guidaUserId)) throw new Error("Questa guida è già sull'uscita.");
      const persone = await listGuideRows(sql, clubId);
      const guida = persone.find((person) => person.userId === data.guidaUserId);
      if (!guida) throw new Error("Questa guida non è dello staff.");
      if (!guida.puoUscire) throw new Error(`${guida.cognome} ${guida.nome} non può uscire. ${guida.motivo}.`);
      const nome = `${guida.cognome} ${guida.nome}`.trim();
      await sql`
        insert into uscita_gruppi (uscita_id, guida_user_id, guida_nome, passaggio)
        values (${data.id}, ${guida.userId}, ${nome}, ${false})
      `;
    }
    const uscita = await loadUscita(sql, clubId, data.id);
    await sql`update uscite set guida_nome = ${uscita.guidaNome} where id = ${data.id} and club_id = ${clubId}`;
    return uscita;
  });

export const togliGruppoUscita = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const gruppoId = Number(raw.gruppoId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(gruppoId) || gruppoId <= 0) throw new Error("Guida non valida.");
    return { id, gruppoId };
  })
  .handler(async ({ context, data }): Promise<UscitaGiorno> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    await uscitaAperta(sql, clubId, data.id, "prima");
    const quanti = await sql<{ n: number }>`
      select count(*)::int as n from uscita_gruppi where uscita_id = ${data.id}
    `;
    if (Number(quanti[0]?.n ?? 0) <= 1) throw new Error("Sull'uscita deve restare almeno una guida.");
    const righe = await sql<{ n: number }>`
      select count(*)::int as n from uscita_righe where uscita_id = ${data.id} and gruppo_id = ${data.gruppoId}
    `;
    if (Number(righe[0]?.n ?? 0) > 0) throw new Error("Prima togli i subacquei di questa guida.");
    await sql`delete from uscita_gruppi where id = ${data.gruppoId} and uscita_id = ${data.id}`;
    const uscita = await loadUscita(sql, clubId, data.id);
    await sql`update uscite set guida_nome = ${uscita.guidaNome} where id = ${data.id} and club_id = ${clubId}`;
    return uscita;
  });

export type SocioVoce = {
  id: number;
  submissionId: number;
  numero: number;
  nota: string;
  anno: number;
  accettatoIl: string;
  nome: string;
  cognome: string;
  brevetto: string;
};

export type SchedaSocioInAttesa = {
  id: number;
  nome: string;
  cognome: string;
  giorno: string;
  anno: number;
  numeroPrecedente: number | null;
};

export type SocioRifiutato = {
  id: number;
  submissionId: number;
  numero: number | null;
  nota: string;
  nome: string;
  cognome: string;
  rifiutatoIl: string;
  anno: number;
  numeroPrecedente: number | null;
  brevetto: string;
};

export type ListaSoci = {
  anno: number;
  soci: SocioVoce[];
  inAttesa: SchedaSocioInAttesa[];
  rifiutati: SocioRifiutato[];
};

export type MioDiving = {
  clubId: number;
  submissionId: number;
  nome: string;
  numero: number;
  anno: number;
  accettatoIl: string;
  intestatario: string;
  verifica: string;
  hasLogo: boolean;
  mezzoNautico: boolean;
  comunicazioni: { id: number; titolo: string; corpo: string; quando: string; file: { id: number; nome: string }[] }[];
};

export type StatoSchedaSocio = {
  stato: "in-attesa" | "accettato" | "rifiutato";
  numero: number | null;
  nota: string;
  anno: number | null;
  rimosso: boolean;
  numeroPrecedente: number | null;
};

function brevettoPrincipale(titolo: string | null, ente: string | null, livello: string | null): string {
  return [ente, livello || titolo].map((voce) => (voce ?? "").trim()).filter(Boolean).join(" ");
}

async function avvisaSocio(sql: Sql, userId: string, clubId: number, submissionId: number, title: string, body: string) {
  await sql`
    insert into notifications (submission_id, title, body, audience, club_id, user_id)
    values (${submissionId}, ${title}, ${body}, ${"sub"}, ${clubId}, ${userId})
  `;
  await pushUsers(sql, [userId], title, body);
}

function giorniFra(oggi: string, fine: string): number {
  const a = Date.parse(`${oggi}T12:00:00Z`);
  const b = Date.parse(`${fine}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function annoIscrizioneDi(valore: string | null | undefined, oggi: string): number {
  const corrente = Number(oggi.slice(0, 4));
  const n = Number(valore);
  if (n === corrente || n === corrente + 1) return n;
  return corrente;
}

async function numeroPrecedenteDi(sql: Sql, clubId: number, userId: string): Promise<number | null> {
  const righe = await sql<{ numero: number }>`
    select numero from soci
    where club_id = ${clubId} and user_id = ${userId} and numero is not null and stato = 'accettato'
    order by anno desc, accettato_il desc nulls last
    limit 1
  `;
  return righe[0]?.numero == null ? null : Number(righe[0].numero);
}

async function prossimoNumeroSocio(sql: Sql, clubId: number): Promise<number> {
  const righe = await sql<{ n: number }>`
    select coalesce(max(numero), 0)::int as n from soci where club_id = ${clubId}
  `;
  return Number(righe[0]?.n ?? 0) + 1;
}

async function numeroDaAssegnare(sql: Sql, clubId: number, userId: string, scelta: "nuovo" | "precedente"): Promise<number> {
  if (scelta === "precedente") {
    const precedente = await numeroPrecedenteDi(sql, clubId, userId);
    if (!precedente) throw new Error("Non c'è un numero precedente.");
    return precedente;
  }
  return prossimoNumeroSocio(sql, clubId);
}

async function scriviNumeroScheda(sql: Sql, submissionId: number, numero: number, anno: number) {
  await sql`
    update submissions
    set payload = jsonb_set(
          jsonb_set(coalesce(payload, '{}'::jsonb), '{numero_tessera}', to_jsonb(${String(numero)}::text), true),
          '{anno_iscrizione}', to_jsonb(${String(anno)}::text), true
        ),
        updated_at = now()
    where id = ${submissionId}
  `;
}

export async function scadenzeSoci(sql: Sql, userId: string): Promise<ScadenzaPersonale[]> {
  await assicuraScadenzeSoci(sql, userId);
  const oggi = todayRome();
  const righe = await sql<{ id: number; anno: number; nome: string }>`
    select s.id, s.anno, c.nome
    from soci s
    join club c on c.id = s.club_id
    where s.user_id = ${userId} and s.stato = 'accettato' and s.rimosso_il is null and s.numero is not null
  `;
  return righe.flatMap((row) => {
    const scadenza = `${row.anno}-12-31`;
    const giorni = giorniFra(oggi, scadenza);
    if (giorni < 0 || giorni > 30) return [];
    return [{ kind: "socio" as const, id: Number(row.id), titolo: row.nome, scadenza }];
  });
}

async function assicuraScadenzeSoci(sql: Sql, userId: string) {
  const oggi = todayRome();
  const righe = await sql<{ id: number; anno: number; nome: string; submission_id: number; club_id: number }>`
    select s.id, s.anno, c.nome, s.submission_id, s.club_id
    from soci s
    join club c on c.id = s.club_id
    where s.user_id = ${userId} and s.stato = 'accettato' and s.rimosso_il is null and s.numero is not null
  `;
  for (const row of righe) {
    const scadenza = `${row.anno}-12-31`;
    const giorni = giorniFra(oggi, scadenza);
    if (giorni < 0 || giorni > 30) continue;
    const title = "Iscrizione socio in scadenza";
    const body = `${row.nome} · anno ${row.anno}. La tessera scade il 31/12/${row.anno}. Puoi rinnovare con una nuova Scheda socio.`;
    const gia = await sql<{ id: number }>`
      select id from notifications
      where user_id = ${userId} and audience = 'sub' and title = ${title} and body = ${body}
      limit 1
    `;
    if (gia[0]) continue;
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id, user_id)
      values (${row.submission_id}, ${title}, ${body}, ${"sub"}, ${row.club_id}, ${userId})
    `;
  }
}

export const listaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ListaSoci> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const anno = Number(todayRome().slice(0, 4));
    const soci = await sql<{
      id: number;
      submission_id: number;
      numero: number;
      nota: string;
      anno: number;
      accettato_il: string;
      nome: string;
      cognome: string;
      titolo: string | null;
      ente: string | null;
      livello: string | null;
    }>`
      select s.id, s.submission_id, s.numero, s.nota, s.anno,
             to_char(s.accettato_il at time zone 'Europe/Rome', 'YYYY-MM-DD') as accettato_il,
             p.nome, p.cognome, b.titolo, b.ente, b.livello
      from soci s
      join profiles p on p.user_id = s.user_id
      left join lateral (
        select titolo, ente, livello
        from brevetti
        where user_id = s.user_id
        order by rilascio desc nulls last, created_at desc
        limit 1
      ) b on true
      where s.club_id = ${clubId} and s.stato = 'accettato' and s.rimosso_il is null
      order by s.anno desc, s.numero asc
    `;
    const inAttesa = await sql<{ id: number; nome: string; cognome: string; giorno: string; anno: string | null; numero_precedente: number | null }>`
      select sub.id, p.nome, p.cognome,
             to_char(sub.created_at at time zone 'Europe/Rome', 'YYYY-MM-DD') as giorno,
             sub.payload->>'anno_iscrizione' as anno,
             prec.numero as numero_precedente
      from submissions sub
      join profiles p on p.user_id = sub.user_id
      left join lateral (
        select numero from soci
        where club_id = sub.club_id and user_id = sub.user_id and numero is not null and stato = 'accettato'
        order by anno desc, accettato_il desc nulls last
        limit 1
      ) prec on true
      where sub.club_id = ${clubId}
        and sub.form_key = 'scheda-socio'
        and sub.status = 'inviato'
        and not exists (select 1 from soci so where so.submission_id = sub.id)
      order by sub.created_at desc
    `;
    const rifiutati = await sql<{
      id: number;
      submission_id: number;
      numero: number | null;
      nota: string;
      anno: number;
      rifiutato_il: string;
      nome: string;
      cognome: string;
      titolo: string | null;
      ente: string | null;
      livello: string | null;
      numero_precedente: number | null;
    }>`
      select so.id, so.submission_id, so.numero, so.nota, so.anno,
             to_char(coalesce(so.rifiutato_il, so.accettato_il) at time zone 'Europe/Rome', 'YYYY-MM-DD') as rifiutato_il,
             p.nome, p.cognome, b.titolo, b.ente, b.livello,
             prec.numero as numero_precedente
      from soci so
      join profiles p on p.user_id = so.user_id
      left join lateral (
        select titolo, ente, livello
        from brevetti
        where user_id = so.user_id
        order by rilascio desc nulls last, created_at desc
        limit 1
      ) b on true
      left join lateral (
        select numero from soci
        where club_id = so.club_id and user_id = so.user_id and numero is not null and stato = 'accettato'
        order by anno desc, accettato_il desc nulls last
        limit 1
      ) prec on true
      where so.club_id = ${clubId} and so.stato = 'rifiutato'
      order by so.rifiutato_il desc nulls last, so.id desc
    `;
    const oggi = todayRome();
    return {
      anno,
      soci: soci.map((row) => ({
        id: Number(row.id),
        submissionId: Number(row.submission_id),
        numero: Number(row.numero),
        nota: row.nota,
        anno: Number(row.anno),
        accettatoIl: row.accettato_il,
        nome: row.nome,
        cognome: row.cognome,
        brevetto: brevettoPrincipale(row.titolo, row.ente, row.livello),
      })),
      inAttesa: inAttesa.map((row) => ({
        id: Number(row.id),
        nome: row.nome,
        cognome: row.cognome,
        giorno: row.giorno,
        anno: annoIscrizioneDi(row.anno, oggi),
        numeroPrecedente: row.numero_precedente == null ? null : Number(row.numero_precedente),
      })),
      rifiutati: rifiutati.map((row) => ({
        id: Number(row.id),
        submissionId: Number(row.submission_id),
        numero: row.numero == null ? null : Number(row.numero),
        nota: row.nota,
        nome: row.nome,
        cognome: row.cognome,
        rifiutatoIl: row.rifiutato_il ?? "",
        anno: Number(row.anno),
        numeroPrecedente: row.numero_precedente == null ? null : Number(row.numero_precedente),
        brevetto: brevettoPrincipale(row.titolo, row.ente, row.livello),
      })),
    };
  });

export const mieiDiving = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MioDiving[]> => {
    const sql = await getSql();
    const rows = await sql<{
      club_id: number;
      submission_id: number;
      nome: string;
      numero: number;
      anno: number;
      accettato_il: string;
      nome_socio: string;
      cognome_socio: string;
      has_logo: boolean | string | null;
      mezzo_nautico: boolean | string | null;
      socio_id: number;
      verifica: string | null;
    }>`
      select s.club_id, s.submission_id, c.nome, s.numero, s.anno,
             to_char(s.accettato_il at time zone 'Europe/Rome', 'YYYY-MM-DD') as accettato_il,
             coalesce(nullif(btrim(sub.payload->>'nome'), ''), p.nome) as nome_socio,
             coalesce(nullif(btrim(sub.payload->>'cognome'), ''), p.cognome) as cognome_socio,
             (c.logo_data is not null and c.logo_data <> '') as has_logo,
             c.mezzo_nautico,
             s.id as socio_id, s.verifica
      from soci s
      join club c on c.id = s.club_id
      join profiles p on p.user_id = s.user_id
      join submissions sub on sub.id = s.submission_id
      where s.user_id = ${context.userId} and s.stato = 'accettato' and s.rimosso_il is null and s.numero is not null
      order by s.anno desc, s.accettato_il desc
    `;
    const messaggi = await sql<{
      id: number;
      club_id: number;
      anno: number;
      titolo: string;
      testo: string;
      quando: string;
      file_id: number | null;
      file_name: string | null;
    }>`
      select c.id, c.club_id, c.anno, c.titolo, c.testo,
             to_char(c.creato_il at time zone 'Europe/Rome', 'YYYY-MM-DD') as quando,
             f.id as file_id, f.file_name
      from soci_comunicazioni_destinatari d
      join soci_comunicazioni c on c.id = d.comunicazione_id
      left join soci_comunicazioni_file f on f.comunicazione_id = c.id
      where d.user_id = ${context.userId}
      order by c.creato_il desc, f.id
    `;
    const perScheda = new Map<number, MioDiving["comunicazioni"]>();
    const visti = new Map<number, MioDiving["comunicazioni"][number]>();
    for (const row of messaggi) {
      const id = Number(row.id);
      let voce = visti.get(id);
      if (!voce) {
        const scheda =
          rows.find((card) => Number(card.club_id) === Number(row.club_id) && Number(card.anno) === Number(row.anno)) ??
          rows.find((card) => Number(card.club_id) === Number(row.club_id));
        if (!scheda) continue;
        voce = { id, titolo: row.titolo, corpo: row.testo, quando: row.quando, file: [] };
        visti.set(id, voce);
        const lista = perScheda.get(Number(scheda.submission_id)) ?? [];
        lista.push(voce);
        perScheda.set(Number(scheda.submission_id), lista);
      }
      if (row.file_id != null && row.file_name) voce.file.push({ id: Number(row.file_id), nome: row.file_name });
    }
    return Promise.all(rows.map(async (row) => {
      const intestatario = `${row.cognome_socio ?? ""} ${row.nome_socio ?? ""}`.replace(/\s+/g, " ").trim();
      return {
        clubId: Number(row.club_id),
        submissionId: Number(row.submission_id),
        nome: row.nome,
        numero: Number(row.numero),
        anno: Number(row.anno),
        accettatoIl: row.accettato_il,
        intestatario,
        verifica: await assicuraVerifica(sql, Number(row.socio_id), row.verifica),
        hasLogo: asBool(row.has_logo),
        mezzoNautico: row.mezzo_nautico == null ? true : asBool(row.mezzo_nautico),
        comunicazioni: perScheda.get(Number(row.submission_id)) ?? [],
      };
    }));
  });

export const statoSchedaSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const submissionId = Number((input as { submissionId?: unknown } | null)?.submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) throw new Error("Scheda non valida.");
    return { submissionId };
  })
  .handler(async ({ context, data }): Promise<StatoSchedaSocio> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const schede = await sql<{ user_id: string; club_id: number | null; form_key: string; anno: string | null }>`
      select user_id, club_id, form_key, payload->>'anno_iscrizione' as anno from submissions where id = ${data.submissionId}
    `;
    const scheda = schede[0];
    if (!scheda || scheda.form_key !== "scheda-socio") throw new Error("Scheda non valida.");
    const mia = scheda.user_id === context.userId;
    const banco = await canDesk(sql, profile, scheda.club_id);
    if (!mia && !banco) throw new Error("Non puoi aprire questa scheda.");
    const precedente = scheda.club_id ? await numeroPrecedenteDi(sql, Number(scheda.club_id), scheda.user_id) : null;
    const righe = await sql<{ stato: string; numero: number | null; nota: string; anno: number; rimosso_il: string | null }>`
      select stato, numero, nota, anno, rimosso_il::text as rimosso_il
      from soci where submission_id = ${data.submissionId}
    `;
    const row = righe[0];
    if (!row) {
      return {
        stato: "in-attesa",
        numero: null,
        nota: "",
        anno: annoIscrizioneDi(scheda.anno, todayRome()),
        rimosso: false,
        numeroPrecedente: precedente,
      };
    }
    return {
      stato: row.stato === "rifiutato" ? "rifiutato" : "accettato",
      numero: row.numero == null ? null : Number(row.numero),
      nota: banco ? row.nota : "",
      anno: Number(row.anno),
      rimosso: Boolean(row.rimosso_il),
      numeroPrecedente: row.stato === "accettato" ? null : precedente,
    };
  });

export const decidiSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const submissionId = Number(raw.submissionId);
    const azione = raw.azione === "accetta" || raw.azione === "rifiuta" ? raw.azione : "";
    const nota = asText(raw.nota).trim().replace(/\s+/g, " ").slice(0, 200);
    const numeroScelta = raw.numeroScelta === "precedente" ? "precedente" : "nuovo";
    if (!Number.isInteger(submissionId) || submissionId <= 0 || !azione) throw new Error("Scheda non valida.");
    return { submissionId, azione, nota, numeroScelta };
  })
  .handler(async ({ context, data }): Promise<{ stato: "accettato" | "rifiutato"; numero: number | null }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const club = await loadClubById(sql, clubId);
    if (!club) throw new Error("Questa utenza non è collegata a una scuola.");
    const schede = await sql<{ id: number; user_id: string; club_id: number | null; form_key: string; status: string; anno: string | null }>`
      select id, user_id, club_id, form_key, status, payload->>'anno_iscrizione' as anno from submissions where id = ${data.submissionId}
    `;
    const scheda = schede[0];
    if (!scheda || scheda.form_key !== "scheda-socio" || Number(scheda.club_id) !== clubId) throw new Error("Scheda non valida.");
    if (scheda.status !== "inviato") throw new Error("La scheda non è ancora stata inviata.");
    const anno = annoIscrizioneDi(scheda.anno, todayRome());
    const gia = await sql<{ id: number; stato: string }>`select id, stato from soci where submission_id = ${scheda.id} limit 1`;
    if (gia[0]?.stato === "accettato") throw new Error("Questa scheda è già stata decisa.");
    if (data.azione === "rifiuta") {
      if (gia[0]) throw new Error("Questa scheda è già stata decisa.");
      await sql`
        insert into soci (club_id, user_id, submission_id, numero, nota, anno, stato, rifiutato_il)
        values (${clubId}, ${scheda.user_id}, ${scheda.id}, null, '', ${anno}, 'rifiutato', now())
      `;
      await avvisaSocio(sql, scheda.user_id, clubId, scheda.id, "Scheda socio rifiutata", `${club.nome} non ha accettato la Scheda socio.`);
      return { stato: "rifiutato", numero: null };
    }
    const attivo = await sql<{ id: number }>`
      select id from soci
      where club_id = ${clubId} and user_id = ${scheda.user_id} and anno = ${anno} and stato = 'accettato' and rimosso_il is null
      limit 1
    `;
    if (attivo[0]) throw new Error("Questa persona è già socio per questo anno.");
    const scelta = data.numeroScelta === "precedente" ? "precedente" : "nuovo";
    const numero = await numeroDaAssegnare(sql, clubId, scheda.user_id, scelta);
    if (gia[0]?.stato === "rifiutato") {
      const aggiornato = await sql<{ id: number }>`
        update soci
        set numero = ${numero}, nota = ${data.nota}, anno = ${anno}, stato = 'accettato', accettato_il = now(), rimosso_il = null
        where id = ${gia[0].id} and stato = 'rifiutato'
        returning id
      `;
      if (!aggiornato[0]) throw new Error("Questa scheda è già stata decisa.");
    } else {
      await sql`
        insert into soci (club_id, user_id, submission_id, numero, nota, anno, stato, accettato_il)
        values (${clubId}, ${scheda.user_id}, ${scheda.id}, ${numero}, ${data.nota}, ${anno}, 'accettato', now())
      `;
    }
    await scriviNumeroScheda(sql, scheda.id, numero, anno);
    await avvisaSocio(
      sql,
      scheda.user_id,
      clubId,
      scheda.id,
      "Scheda socio accettata",
      `${club.nome} ti ha accettato come socio per il ${anno}. Numero scheda: ${numero}.`,
    );
    return { stato: "accettato", numero };
  });

export const aggiornaNotaSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const nota = asText(raw.nota).trim().replace(/\s+/g, " ").slice(0, 200);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Socio non valido.");
    return { id, nota };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const aggiornati = await sql<{ id: number }>`
      update soci
      set nota = ${data.nota}
      where id = ${data.id} and club_id = ${profile.clubId} and stato in ('accettato', 'rifiutato') and rimosso_il is null
      returning id
    `;
    if (!aggiornati[0]) throw new Error("Socio non valido.");
    return { ok: true };
  });

export const rimuoviSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Socio non valido.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const anno = Number(todayRome().slice(0, 4));
    const aggiornati = await sql<{ id: number }>`
      update soci
      set rimosso_il = now()
      where id = ${data.id}
        and club_id = ${profile.clubId}
        and stato = 'accettato'
        and rimosso_il is null
        and anno = ${anno}
      returning id
    `;
    if (!aggiornati[0]) throw new Error("Puoi togliere un socio solo dall'anno in corso.");
    return { ok: true };
  });

export type ComunicazioneSoci = {
  id: number;
  titolo: string;
  testo: string;
  quando: string;
  anno: number;
  tutti: boolean;
  destinatari: number;
  file: { id: number; nome: string }[];
};

export type PaginaComunicazioniSoci = {
  anno: number;
  soci: { userId: string; numero: number; nome: string; cognome: string }[];
  inviate: ComunicazioneSoci[];
};

function allegatoComunicazione(file: unknown): { name: string; data: string } {
  const raw = file && typeof file === "object" ? (file as Record<string, unknown>) : {};
  const name = asText(raw.name).trim().replace(/[\\/]/g, "").slice(0, 120);
  const data = asText(raw.data).trim();
  const tipi: [string, string][] = [
    ["data:application/pdf;base64,", ".pdf"],
    ["data:image/jpeg;base64,", ".jpg"],
    ["data:image/jpg;base64,", ".jpg"],
    ["data:image/png;base64,", ".png"],
    ["data:image/webp;base64,", ".webp"],
    ["data:image/gif;base64,", ".gif"],
  ];
  const tipo = tipi.find(([prefix]) => data.startsWith(prefix));
  if (!name || !tipo) throw new Error("Allega un PDF o un'immagine.");
  if (data.length > 2_200_000) throw new Error("Ogni allegato può pesare al massimo 1,5 MB.");
  const ext = tipo[1];
  const gia = name.toLowerCase().endsWith(ext) || (ext === ".jpg" && /\.jpe?g$/i.test(name));
  const base = name.replace(/\.[^.]+$/, "") || "allegato";
  return { name: gia ? name : `${base.slice(0, 110)}${ext}`, data };
}

export const listaComunicazioniSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PaginaComunicazioniSoci> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const anno = Number(todayRome().slice(0, 4));
    const soci = await sql<{ user_id: string; numero: number; nome: string; cognome: string }>`
      select s.user_id, s.numero, p.nome, p.cognome
      from soci s
      join profiles p on p.user_id = s.user_id
      where s.club_id = ${clubId} and s.anno = ${anno} and s.stato = 'accettato' and s.rimosso_il is null
      order by p.cognome, p.nome
    `;
    const righe = await sql<{
      id: number;
      titolo: string;
      testo: string;
      quando: string;
      anno: number;
      tutti: boolean;
      destinatari: number;
      file_id: number | null;
      file_name: string | null;
    }>`
      select c.id, c.titolo, c.testo, c.tutti, c.anno,
             to_char(c.creato_il at time zone 'Europe/Rome', 'YYYY-MM-DD') as quando,
             (select count(*)::int from soci_comunicazioni_destinatari d where d.comunicazione_id = c.id) as destinatari,
             f.id as file_id, f.file_name
      from soci_comunicazioni c
      left join soci_comunicazioni_file f on f.comunicazione_id = c.id
      where c.club_id = ${clubId}
      order by c.creato_il desc, f.id
    `;
    const inviate: ComunicazioneSoci[] = [];
    const indice = new Map<number, ComunicazioneSoci>();
    for (const row of righe) {
      const id = Number(row.id);
      let voce = indice.get(id);
      if (!voce) {
        voce = {
          id,
          titolo: row.titolo,
          testo: row.testo,
          quando: row.quando,
          anno: Number(row.anno),
          tutti: asFlag(row.tutti),
          destinatari: Number(row.destinatari),
          file: [],
        };
        indice.set(id, voce);
        inviate.push(voce);
      }
      if (row.file_id != null && row.file_name) voce.file.push({ id: Number(row.file_id), nome: row.file_name });
    }
    return {
      anno,
      soci: soci.map((row) => ({
        userId: row.user_id,
        numero: Number(row.numero),
        nome: row.nome,
        cognome: row.cognome,
      })),
      inviate,
    };
  });

export const pubblicaComunicazioneSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const titolo = asText(raw.titolo).trim().replace(/\s+/g, " ").slice(0, 120);
    const testo = asText(raw.testo).trim().slice(0, 4000);
    const tutti = raw.tutti === true;
    const utenti = Array.isArray(raw.utenti) ? [...new Set(raw.utenti.map((voce) => asText(voce).trim()).filter(Boolean))].slice(0, 500) : [];
    const file = Array.isArray(raw.file) ? raw.file.slice(0, 4).map(allegatoComunicazione) : [];
    if (!titolo || !testo) throw new Error("Scrivi titolo e testo.");
    if (file.length > 4) throw new Error("Puoi allegare al massimo 4 file.");
    if (!tutti && utenti.length === 0) throw new Error("Scegli almeno un socio.");
    return { titolo, testo, tutti, utenti, file };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const club = await loadClubById(sql, clubId);
    if (!club) throw new Error("Questa utenza non è collegata a una scuola.");
    const anno = Number(todayRome().slice(0, 4));
    const soci = await sql<{ user_id: string }>`
      select user_id from soci
      where club_id = ${clubId} and anno = ${anno} and stato = 'accettato' and rimosso_il is null
    `;
    const ammessi = new Set(soci.map((row) => row.user_id));
    const destinatari = data.tutti ? [...ammessi] : data.utenti.filter((id) => ammessi.has(id));
    if (destinatari.length === 0) throw new Error(data.tutti ? "Non ci sono soci nell'anno in corso." : "Scegli almeno un socio.");
    const creati = await sql<{ id: number }>`
      insert into soci_comunicazioni (club_id, anno, titolo, testo, tutti, creato_da)
      values (${clubId}, ${anno}, ${data.titolo}, ${data.testo}, ${data.tutti}, ${context.userId})
      returning id
    `;
    const id = Number(creati[0]?.id);
    if (!id) throw new Error("Non riesco a pubblicare la comunicazione.");
    try {
      for (const file of data.file) {
        await sql`
          insert into soci_comunicazioni_file (comunicazione_id, file_name, file_data)
          values (${id}, ${file.name}, ${file.data})
        `;
      }
      for (const userId of destinatari) {
        await sql`
          insert into soci_comunicazioni_destinatari (comunicazione_id, user_id)
          values (${id}, ${userId})
        `;
      }
      const titoloAvviso = data.titolo.replace(/[«»]/g, "");
      const body = `${club.nome} ha pubblicato «${titoloAvviso}».\n${data.testo}`;
      for (const userId of destinatari) {
        await sql`
          insert into notifications (submission_id, title, body, audience, club_id, user_id, soci_comunicazione_id)
          values (null, ${"Comunicazione ai soci"}, ${body}, ${"sub"}, ${clubId}, ${userId}, ${id})
        `;
      }
      await pushUsers(sql, destinatari, "Comunicazione ai soci", body);
    } catch (error) {
      await sql`delete from soci_comunicazioni where id = ${id}`;
      throw error;
    }
    return { id };
  });

export const eliminaComunicazioneSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Comunicazione non trovata.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const esiste = await sql<{ id: number }>`
      select id from soci_comunicazioni where id = ${data.id} and club_id = ${profile.clubId} limit 1
    `;
    if (!esiste[0]) throw new Error("Comunicazione non trovata.");
    await sql`delete from notifications where soci_comunicazione_id = ${data.id}`;
    await sql`delete from soci_comunicazioni where id = ${data.id} and club_id = ${profile.clubId}`;
    return { ok: true };
  });

export const scaricaDocumentoSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Documento non disponibile.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ nome: string; data: string }> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const righe = await sql<{ file_name: string; file_data: string; club_id: number; destinatario: string | null }>`
      select f.file_name, f.file_data, c.club_id, d.user_id as destinatario
      from soci_comunicazioni_file f
      join soci_comunicazioni c on c.id = f.comunicazione_id
      left join soci_comunicazioni_destinatari d on d.comunicazione_id = c.id and d.user_id = ${context.userId}
      where f.id = ${data.id}
      limit 1
    `;
    const file = righe[0];
    if (!file) throw new Error("Documento non disponibile.");
    const banco = await canDesk(sql, profile, file.club_id);
    if (!file.destinatario && !banco) throw new Error("Documento non disponibile.");
    return { nome: file.file_name, data: file.file_data };
  });

function tokenVerifica(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

async function assicuraVerifica(sql: Sql, sociId: number, attuale: string | null): Promise<string> {
  const presente = (attuale ?? "").trim();
  if (/^[a-f0-9]{32,80}$/.test(presente)) return presente;
  for (let i = 0; i < 4; i++) {
    const token = tokenVerifica();
    const scritti = await sql<{ verifica: string }>`
      update soci set verifica = ${token}
      where id = ${sociId} and (verifica is null or verifica = '')
      returning verifica
    `;
    if (scritti[0]?.verifica) return scritti[0].verifica;
    const gia = await sql<{ verifica: string }>`select verifica from soci where id = ${sociId} limit 1`;
    if (gia[0]?.verifica) return gia[0].verifica;
  }
  return "";
}

export type TesseraSocioDato = {
  intestatario: string;
  numero: number;
  club: string;
  clubId: number;
  hasLogo: boolean;
  anno: number;
  verifica: string;
};

export const tesseraScheda = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const submissionId = Number((input as { submissionId?: unknown } | null)?.submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) throw new Error("Scheda non valida.");
    return { submissionId };
  })
  .handler(async ({ context, data }): Promise<TesseraSocioDato | null> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) return null;
    const righe = await sql<{
      user_id: string;
      club_id: number;
      numero: number | null;
      anno: number;
      rimosso_il: string | null;
      stato: string;
      club: string;
      has_logo: boolean | string | null;
      socio_id: number;
      verifica: string | null;
      nome_socio: string;
      cognome_socio: string;
    }>`
      select s.user_id, s.club_id, s.numero, s.anno, s.rimosso_il::text as rimosso_il, s.stato, c.nome as club,
             (c.logo_data is not null and c.logo_data <> '') as has_logo,
             s.id as socio_id, s.verifica,
             coalesce(nullif(btrim(sub.payload->>'nome'), ''), p.nome) as nome_socio,
             coalesce(nullif(btrim(sub.payload->>'cognome'), ''), p.cognome) as cognome_socio
      from soci s
      join submissions sub on sub.id = s.submission_id
      join club c on c.id = s.club_id
      join profiles p on p.user_id = s.user_id
      where s.submission_id = ${data.submissionId}
      limit 1
    `;
    const row = righe[0];
    if (!row || row.stato !== "accettato" || row.rimosso_il || row.numero == null) return null;
    const mia = row.user_id === context.userId;
    const banco = await canDesk(sql, profile, row.club_id);
    if (!mia && !banco) return null;
    const intestatario = `${row.cognome_socio ?? ""} ${row.nome_socio ?? ""}`.replace(/\s+/g, " ").trim();
    const numero = Number(row.numero);
    const anno = Number(row.anno);
    const verifica = await assicuraVerifica(sql, Number(row.socio_id), row.verifica);
    return { intestatario, numero, club: row.club, clubId: Number(row.club_id), hasLogo: asBool(row.has_logo), anno, verifica };
  });

export type VerificaTessera = {
  intestatario: string;
  numero: number;
  club: string;
  anno: number;
  attivo: boolean;
  logo: string;
};

export const verificaTessera = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const token = asText((input as { token?: unknown } | null)?.token).trim().toLowerCase();
    if (!/^[a-f0-9]{32,80}$/.test(token)) throw new Error("Tessera non trovata.");
    return { token };
  })
  .handler(async ({ data }): Promise<VerificaTessera | null> => {
    const sql = await getSql();
    const righe = await sql<{
      numero: number | null;
      anno: number;
      stato: string;
      rimosso_il: string | null;
      club: string;
      logo_data: string | null;
      nome_socio: string;
      cognome_socio: string;
    }>`
      select s.numero, s.anno, s.stato, s.rimosso_il::text as rimosso_il, c.nome as club, c.logo_data,
             coalesce(nullif(btrim(sub.payload->>'nome'), ''), p.nome) as nome_socio,
             coalesce(nullif(btrim(sub.payload->>'cognome'), ''), p.cognome) as cognome_socio
      from soci s
      join submissions sub on sub.id = s.submission_id
      join club c on c.id = s.club_id
      join profiles p on p.user_id = s.user_id
      where s.verifica = ${data.token}
      limit 1
    `;
    const row = righe[0];
    if (!row || row.numero == null) return null;
    const anno = Number(row.anno);
    const oggi = todayRome();
    const attivo = row.stato === "accettato" && !row.rimosso_il && oggi <= `${anno}-12-31`;
    const logo = row.logo_data && row.logo_data.startsWith("data:image/") ? row.logo_data : "";
    const intestatario = `${row.cognome_socio ?? ""} ${row.nome_socio ?? ""}`.replace(/\s+/g, " ").trim();
    return { intestatario, numero: Number(row.numero), club: row.club, anno, attivo, logo };
  });

export type AttivitaSoci = {
  id: number;
  clubId: number;
  club: string;
  titolo: string;
  giorno: string;
  orario: string;
  descrizione: string;
  immagine: string;
  iscrizione: boolean;
  iscritto: boolean;
  possoIscrivermi: boolean;
  gestita: boolean;
  partecipanti: { nome: string; cognome: string }[];
};

export type PaginaAttivitaSoci = {
  puoCreare: boolean;
  attivita: AttivitaSoci[];
};

function quandoAttivita(giorno: string, orario: string): string {
  const [anno, mese, num] = giorno.split("-");
  return orario ? `${num}/${mese}/${anno} · ${orario}` : `${num}/${mese}/${anno}`;
}

async function avvisaScuolaAttivita(sql: Sql, clubId: number, title: string, body: string, url: string) {
  try {
    await sql`
      insert into notifications (submission_id, title, body, audience, club_id)
      values (null, ${title}, ${body}, ${"staff"}, ${clubId})
    `;
    await pushSchoolPhone(sql, clubId, title, body, undefined, url, true);
  } catch {
    /* l'iscrizione resta anche se il telefono della scuola non riceve la notifica */
  }
}

async function avvisaSociAttivita(sql: Sql, clubId: number, title: string, body: string, url: string) {
  try {
    const anno = Number(todayRome().slice(0, 4));
    const soci = await sql<{ user_id: string }>`
      select distinct user_id from soci
      where club_id = ${clubId} and anno >= ${anno} and stato = 'accettato' and rimosso_il is null
    `;
    const destinatari = soci.map((row) => row.user_id).filter(Boolean);
    if (!destinatari.length) return;
    for (const userId of destinatari) {
      await sql`
        insert into notifications (submission_id, title, body, audience, club_id, user_id)
        values (null, ${title}, ${body}, ${"sub"}, ${clubId}, ${userId})
      `;
    }
    await pushUsers(sql, destinatari, title, body, url, true);
  } catch {
    /* l'attività resta anche se un telefono non riceve la notifica */
  }
}

function immagineAttivita(value: unknown): string {
  const data = asText(value).trim();
  if (!data) return "";
  if (!/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/.test(data)) throw new Error("Allega un'immagine.");
  if (data.length > 2_200_000) throw new Error("Ogni allegato può pesare al massimo 1,5 MB.");
  return data;
}

export const listaAttivitaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PaginaAttivitaSoci> => {
    const sql = await getSql();
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Completa prima il profilo.");
    const clubId = profile.clubId ?? 0;
    const banco = clubId > 0 && (await canDesk(sql, profile, clubId));
    const righe = await sql<{
      id: number;
      club_id: number;
      club: string;
      titolo: string;
      giorno: string;
      orario: string;
      descrizione: string;
      immagine: string;
      iscrizione: boolean;
    }>`
      select a.id, a.club_id, c.nome as club, a.titolo, a.giorno::text as giorno, a.orario, a.descrizione, a.immagine, a.iscrizione
      from soci_attivita a
      join club c on c.id = a.club_id
      where (${banco} and a.club_id = ${clubId})
         or exists (
           select 1 from soci s
           where s.club_id = a.club_id and s.user_id = ${context.userId}
             and s.stato = 'accettato' and s.rimosso_il is null
         )
      order by a.giorno asc, a.orario asc, a.id asc
    `;
    const mie = await sql<{ attivita_id: number; club_id: number }>`
      select i.attivita_id, a.club_id
      from soci_attivita_iscrizioni i
      join soci_attivita a on a.id = i.attivita_id
      where i.user_id = ${context.userId}
    `;
    const societa = await sql<{ club_id: number }>`
      select distinct club_id from soci
      where user_id = ${context.userId} and stato = 'accettato' and rimosso_il is null
    `;
    const iscritto = new Set(mie.map((row) => Number(row.attivita_id)));
    const membro = new Set(societa.map((row) => Number(row.club_id)));
    const partecipanti = new Map<number, { nome: string; cognome: string }[]>();
    if (banco) {
      const persone = await sql<{ attivita_id: number; nome: string; cognome: string }>`
        select i.attivita_id, p.nome, p.cognome
        from soci_attivita_iscrizioni i
        join soci_attivita a on a.id = i.attivita_id
        join profiles p on p.user_id = i.user_id
        where a.club_id = ${clubId}
        order by p.cognome, p.nome
      `;
      for (const persona of persone) {
        const id = Number(persona.attivita_id);
        const lista = partecipanti.get(id) ?? [];
        lista.push({ nome: persona.nome, cognome: persona.cognome });
        partecipanti.set(id, lista);
      }
    }
    return {
      puoCreare: banco,
      attivita: righe.map((row) => ({
        id: Number(row.id),
        clubId: Number(row.club_id),
        club: row.club,
        titolo: row.titolo,
        giorno: String(row.giorno).slice(0, 10),
        orario: row.orario,
        descrizione: row.descrizione,
        immagine: row.immagine,
        iscrizione: asFlag(row.iscrizione),
        iscritto: iscritto.has(Number(row.id)),
        possoIscrivermi: membro.has(Number(row.club_id)),
        gestita: banco && Number(row.club_id) === clubId,
        partecipanti: banco && Number(row.club_id) === clubId ? (partecipanti.get(Number(row.id)) ?? []) : [],
      })),
    };
  });

export const creaAttivitaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const titolo = asText(raw.titolo).trim().replace(/\s+/g, " ").slice(0, 120);
    const giorno = asText(raw.giorno).trim();
    const orario = asText(raw.orario).trim().slice(0, 5);
    const descrizione = asText(raw.descrizione).trim().slice(0, 2000);
    const iscrizione = raw.iscrizione === true;
    const immagine = immagineAttivita(raw.immagine);
    if (!titolo || !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) throw new Error("Scrivi titolo e data.");
    if (orario && !/^\d{2}:\d{2}$/.test(orario)) throw new Error("Controlla l'orario.");
    return { titolo, giorno, orario, descrizione, iscrizione, immagine };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const creati = await sql<{ id: number }>`
      insert into soci_attivita (club_id, titolo, giorno, orario, descrizione, immagine, iscrizione)
      values (${clubId}, ${data.titolo}, ${data.giorno}, ${data.orario}, ${data.descrizione}, ${data.immagine}, ${data.iscrizione})
      returning id
    `;
    const id = Number(creati[0]?.id);
    if (!id) throw new Error("Non riesco a salvare l'attività.");
    const quando = quandoAttivita(data.giorno, data.orario);
    await avvisaSociAttivita(sql, clubId, data.titolo, quando, `/attivita-soci?id=${id}`);
    return { id };
  });

export const iscrivitiAttivitaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const azione = raw.azione === "disiscriviti" ? "disiscriviti" : raw.azione === "iscriviti" ? "iscriviti" : "";
    if (!Number.isInteger(id) || id <= 0 || !azione) throw new Error("Attività non trovata.");
    return { id, azione };
  })
  .handler(async ({ context, data }): Promise<{ iscritto: boolean }> => {
    const sql = await getSql();
    const righe = await sql<{ club_id: number; iscrizione: boolean; titolo: string }>`
      select club_id, iscrizione, titolo from soci_attivita where id = ${data.id} limit 1
    `;
    const attivita = righe[0];
    if (!attivita || !asFlag(attivita.iscrizione)) throw new Error("Attività non trovata.");
    const membro = await sql<{ id: number }>`
      select id from soci
      where club_id = ${attivita.club_id} and user_id = ${context.userId}
        and stato = 'accettato' and rimosso_il is null
      limit 1
    `;
    if (!membro[0]) throw new Error("Non sei socio di questo diving.");
    const profilo = await loadProfile(sql, context.userId);
    const chi = `${profilo?.cognome ?? ""} ${profilo?.nome ?? ""}`.replace(/\s+/g, " ").trim() || "Un socio";
    const titoloAttivita = attivita.titolo.replace(/[«»]/g, "");
    if (data.azione === "disiscriviti") {
      const tolte = await sql<{ user_id: string }>`
        delete from soci_attivita_iscrizioni where attivita_id = ${data.id} and user_id = ${context.userId} returning user_id
      `;
      if (tolte[0]) {
        await avvisaScuolaAttivita(
          sql,
          Number(attivita.club_id),
          "Partecipazione annullata",
          `${chi} ha annullato la partecipazione a «${titoloAttivita}».`,
          `/attivita-soci?id=${data.id}`,
        );
      }
      return { iscritto: false };
    }
    const messi = await sql<{ user_id: string }>`
      insert into soci_attivita_iscrizioni (attivita_id, user_id)
      values (${data.id}, ${context.userId})
      on conflict do nothing
      returning user_id
    `;
    if (messi[0]) {
      await avvisaScuolaAttivita(
        sql,
        Number(attivita.club_id),
        "Iscrizione attività",
        `${chi} si è iscritto a «${titoloAttivita}».`,
        `/attivita-soci?id=${data.id}`,
      );
    }
    return { iscritto: true };
  });

export const aggiornaAttivitaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const id = Number(raw.id);
    const titolo = asText(raw.titolo).trim().replace(/\s+/g, " ").slice(0, 120);
    const giorno = asText(raw.giorno).trim();
    const orario = asText(raw.orario).trim().slice(0, 5);
    const descrizione = asText(raw.descrizione).trim().slice(0, 2000);
    const iscrizione = raw.iscrizione === true;
    const immagine = immagineAttivita(raw.immagine);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Attività non trovata.");
    if (!titolo || !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) throw new Error("Scrivi titolo e data.");
    if (orario && !/^\d{2}:\d{2}$/.test(orario)) throw new Error("Controlla l'orario.");
    return { id, titolo, giorno, orario, descrizione, iscrizione, immagine };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const prima = await sql<{ titolo: string; giorno: string; orario: string; descrizione: string; iscrizione: boolean | string; immagine: string }>`
      select titolo, giorno::text as giorno, orario, descrizione, iscrizione, immagine
      from soci_attivita where id = ${data.id} and club_id = ${clubId} limit 1
    `;
    const vecchia = prima[0];
    if (!vecchia) throw new Error("Attività non trovata.");
    await sql`
      update soci_attivita
      set titolo = ${data.titolo}, giorno = ${data.giorno}, orario = ${data.orario},
          descrizione = ${data.descrizione}, immagine = ${data.immagine}, iscrizione = ${data.iscrizione}
      where id = ${data.id} and club_id = ${clubId}
    `;
    const giornoPrima = String(vecchia.giorno).slice(0, 10);
    const cambiata =
      vecchia.titolo !== data.titolo ||
      giornoPrima !== data.giorno ||
      vecchia.orario !== data.orario ||
      vecchia.descrizione !== data.descrizione ||
      asFlag(vecchia.iscrizione) !== data.iscrizione ||
      vecchia.immagine !== data.immagine;
    if (cambiata) {
      await avvisaSociAttivita(
        sql,
        clubId,
        "Attività modificata",
        `${data.titolo}\n${quandoAttivita(data.giorno, data.orario)}`,
        `/attivita-soci?id=${data.id}`,
      );
    }
    return { ok: true };
  });

export const eliminaAttivitaSoci = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Attività non trovata.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const clubId = profile.clubId ?? 0;
    const prima = await sql<{ titolo: string; giorno: string; orario: string }>`
      select titolo, giorno::text as giorno, orario
      from soci_attivita where id = ${data.id} and club_id = ${clubId} limit 1
    `;
    const vecchia = prima[0];
    if (!vecchia) throw new Error("Attività non trovata.");
    const tolte = await sql<{ id: number }>`
      delete from soci_attivita where id = ${data.id} and club_id = ${clubId} returning id
    `;
    if (!tolte[0]) throw new Error("Attività non trovata.");
    const giorno = String(vecchia.giorno).slice(0, 10);
    await avvisaSociAttivita(
      sql,
      clubId,
      "Attività annullata",
      `${vecchia.titolo}\n${quandoAttivita(giorno, vecchia.orario)}`,
      "/attivita-soci",
    );
    return { ok: true };
  });

export type DocumentoSocioVoce = {
  id: number;
  kind: "medico" | "assicurazione";
  titolo: string;
  scadenza: string;
  nome: string;
  tipo: string;
};

async function accessoSchedaSocio(sql: Sql, userId: string, submissionId: number): Promise<{ mia: boolean }> {
  const profile = await loadProfile(sql, userId);
  if (!profile) throw new Error("Completa prima il profilo.");
  const righe = await sql<{ user_id: string; club_id: number | null; form_key: string }>`
    select user_id, club_id, form_key from submissions where id = ${submissionId} limit 1
  `;
  const scheda = righe[0];
  if (!scheda || scheda.form_key !== "scheda-socio") throw new Error("Scheda non valida.");
  const mia = scheda.user_id === userId;
  const banco = scheda.club_id != null && (await canDesk(sql, profile, Number(scheda.club_id)));
  if (!mia && !banco) throw new Error("Scheda non valida.");
  return { mia };
}

export const listaDocumentiSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const submissionId = Number((input as { submissionId?: unknown } | null)?.submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) throw new Error("Scheda non valida.");
    return { submissionId };
  })
  .handler(async ({ context, data }): Promise<{ medico: DocumentoSocioVoce | null; assicurazione: DocumentoSocioVoce | null }> => {
    const sql = await getSql();
    await accessoSchedaSocio(sql, context.userId, data.submissionId);
    const righe = await sql<{ id: number; kind: string; titolo: string; scadenza: string; file_name: string; file_type: string }>`
      select id, kind, titolo, scadenza, file_name, file_type
      from soci_documenti
      where submission_id = ${data.submissionId}
    `;
    const voce = (kind: "medico" | "assicurazione"): DocumentoSocioVoce | null => {
      const row = righe.find((item) => item.kind === kind);
      if (!row) return null;
      return {
        id: Number(row.id),
        kind,
        titolo: row.titolo,
        scadenza: /^\d{4}-\d{2}-\d{2}$/.test(row.scadenza) ? row.scadenza : "",
        nome: row.file_name,
        tipo: row.file_type,
      };
    };
    return { medico: voce("medico"), assicurazione: voce("assicurazione") };
  });

export const scaricaDocumentoSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown } | null)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Documento non disponibile.");
    return { id };
  })
  .handler(async ({ context, data }): Promise<{ nome: string; tipo: string; data: string }> => {
    const sql = await getSql();
    const righe = await sql<{ submission_id: number; file_name: string; file_type: string; file_data: string }>`
      select submission_id, file_name, file_type, file_data from soci_documenti where id = ${data.id} limit 1
    `;
    const file = righe[0];
    if (!file) throw new Error("Documento non disponibile.");
    await accessoSchedaSocio(sql, context.userId, Number(file.submission_id));
    return { nome: file.file_name, tipo: file.file_type, data: file.file_data };
  });

export const salvaDocumentoSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const submissionId = Number(raw.submissionId);
    const kind = raw.kind === "medico" || raw.kind === "assicurazione" ? raw.kind : "";
    if (!Number.isInteger(submissionId) || submissionId <= 0 || !kind) throw new Error("Documento non valido.");
    const file = readStoredFile(raw.file);
    const titolo = asText(raw.titolo).trim().slice(0, 120) || (kind === "medico" ? "Certificato medico" : "Assicurazione");
    const scadenza = asText(raw.scadenza).trim();
    if (scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(scadenza)) throw new Error("Controlla la data: scadenza.");
    return { submissionId, kind, titolo, scadenza, file };
  })
  .handler(async ({ context, data }): Promise<{ id: number }> => {
    const sql = await getSql();
    const accesso = await accessoSchedaSocio(sql, context.userId, data.submissionId);
    if (!accesso.mia) throw new Error("Solo il socio può allegare questo documento.");
    const salvati = await sql<{ id: number }>`
      insert into soci_documenti (submission_id, user_id, kind, titolo, scadenza, file_name, file_type, file_data)
      values (${data.submissionId}, ${context.userId}, ${data.kind}, ${data.titolo}, ${data.scadenza}, ${data.file.name}, ${data.file.type}, ${data.file.data})
      on conflict (submission_id, kind) do update
        set titolo = excluded.titolo,
            scadenza = excluded.scadenza,
            file_name = excluded.file_name,
            file_type = excluded.file_type,
            file_data = excluded.file_data,
            creato_il = now()
      returning id
    `;
    const id = Number(salvati[0]?.id);
    if (!id) throw new Error("Documento non salvato.");
    return { id };
  });

export const togliDocumentoSocio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const submissionId = Number(raw.submissionId);
    const kind = raw.kind === "medico" || raw.kind === "assicurazione" ? raw.kind : "";
    if (!Number.isInteger(submissionId) || submissionId <= 0 || !kind) throw new Error("Documento non valido.");
    return { submissionId, kind };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const accesso = await accessoSchedaSocio(sql, context.userId, data.submissionId);
    if (!accesso.mia) throw new Error("Solo il socio può allegare questo documento.");
    await sql`delete from soci_documenti where submission_id = ${data.submissionId} and kind = ${data.kind} and user_id = ${context.userId}`;
    return { ok: true };
  });




