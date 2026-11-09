export type Role = "subacqueo" | "istruttore" | "scuola" | "piattaforma";

export function isStaff(role: Role | null | undefined): boolean {
  return role === "istruttore" || role === "scuola";
}

export type Field =
  | { type: "section"; title: string; hint?: string; showWhen?: { key: string; equals: string }; inline?: boolean }
  | { type: "note"; text: string }
  | {
      type: "text" | "email" | "tel" | "date" | "time" | "number" | "textarea";
      key: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      hint?: string;
      half?: boolean;
      locked?: boolean;
      showWhen?: { key: string; equals: string };
    }
  | {
      type: "select";
      key: string;
      label: string;
      required?: boolean;
      options: { value: string; label: string }[];
      half?: boolean;
    }
  | { type: "yesno"; key: string; label: string; required?: boolean; showWhen?: { key: string; equals: string } }
  | { type: "check"; key: string; label: string; required?: boolean }
  | {
      type: "checks";
      key: string;
      label: string;
      required?: boolean;
      options: { value: string; label: string; group: string }[];
    }
  | { type: "photo"; key: string; label: string; hint?: string; daBrevetti?: boolean }
  | { type: "sign"; key: string; label: string; required?: boolean; hint?: string }
  | { type: "periodo"; key: string; label: string; required?: boolean };

export type FormGroup = "persone" | "immersioni" | "staff" | "attrezzatura";

export type FormDef = {
  key: string;
  title: string;
  kicker: string;
  summary: string;
  legal: string;
  audience: Role[];
  group: FormGroup;
  dateKey?: string;
  subject: (data: Record<string, string>) => string;
  fields: Field[];
  whenRequire?: { when: string; equals: string; require: string[] }[];
};

export const DISCLAIMER =
  "Modelli operativi allineati alla normativa vigente e alla prassi documentale del settore. Sono esempi di lavoro: non sostituiscono certificato medico o polizza e i registri di immersione vanno conservati secondo quanto previsto dalla legge.";

export const ROLE_LABEL: Record<Role, string> = {
  subacqueo: "Subacqueo",
  istruttore: "Staff della scuola",
  scuola: "Scuola",
  piattaforma: "Gestore",
};

export const GROUP_LABEL: Record<FormGroup | "tutti", string> = {
  tutti: "Tutti",
  persone: "Persone",
  immersioni: "Immersioni",
  staff: "Staff",
  attrezzatura: "Attrezzatura",
};

const person = (extra: Field[] = []): Field[] => [
  { type: "section", title: "Anagrafica" },
  { type: "text", key: "cognome", label: "Cognome", required: true, half: true },
  { type: "text", key: "nome", label: "Nome", required: true, half: true },
  {
    type: "text",
    key: "codice_fiscale",
    label: "Codice fiscale",
    required: true,
    half: true,
    placeholder: "RSSMRA80A01H501U",
  },
  { type: "date", key: "data_nascita", label: "Data di nascita", required: true, half: true },
  { type: "text", key: "luogo_nascita", label: "Luogo di nascita", required: true, half: true },
  {
    type: "select",
    key: "sesso",
    label: "Sesso",
    half: true,
    options: [
      { value: "", label: "—" },
      { value: "F", label: "F" },
      { value: "M", label: "M" },
      { value: "X", label: "Altro / non indicato" },
    ],
  },
  { type: "section", title: "Residenza e contatti" },
  { type: "text", key: "indirizzo", label: "Indirizzo", required: true },
  { type: "text", key: "cap", label: "CAP", half: true },
  { type: "text", key: "citta", label: "Città", required: true, half: true },
  { type: "text", key: "provincia", label: "Provincia", half: true },
  { type: "tel", key: "telefono", label: "Telefono", required: true, half: true },
  { type: "email", key: "email", label: "Email", required: true, half: true },
  { type: "section", title: "Documento" },
  {
    type: "select",
    key: "tipo_documento",
    label: "Tipo",
    required: true,
    half: true,
    options: [
      { value: "Carta di identità", label: "Carta di identità" },
      { value: "Passaporto", label: "Passaporto" },
      { value: "Patente", label: "Patente" },
    ],
  },
  { type: "text", key: "numero_documento", label: "Numero", required: true, half: true },
  ...extra,
];

const SPECIALITA: { value: string; label: string; group: string }[] = [
  ["nitrox", "Nitrox", "Gas e profondità"],
  ["nitrox-avanzato", "Nitrox avanzato", "Gas e profondità"],
  ["profonda", "Profonda", "Gas e profondità"],
  ["multilivello", "Multilivello", "Gas e profondità"],
  ["computer", "Computer subacqueo", "Gas e profondità"],
  ["decompressione", "Decompressione", "Gas e profondità"],
  ["trimix", "Trimix", "Gas e profondità"],
  ["rebreather", "Rebreather", "Gas e profondità"],
  ["notturna", "Notturna", "Ambiente"],
  ["visibilita", "Visibilità ridotta", "Ambiente"],
  ["corrente", "Corrente", "Ambiente"],
  ["alta-quota", "Alta quota", "Ambiente"],
  ["ghiaccio", "Ghiaccio", "Ambiente"],
  ["da-barca", "Da barca", "Ambiente"],
  ["da-riva", "Da riva", "Ambiente"],
  ["relitto", "Relitto", "Ambiente"],
  ["penetrazione-relitto", "Penetrazione relitto", "Ambiente"],
  ["caverna", "Caverna", "Ambiente"],
  ["grotta", "Grotta", "Ambiente"],
  ["assetto", "Assetto", "Attrezzatura"],
  ["muta-stagna", "Muta stagna", "Attrezzatura"],
  ["sidemount", "Sidemount", "Attrezzatura"],
  ["bibombola", "Bibombola", "Attrezzatura"],
  ["scooter", "Scooter", "Attrezzatura"],
  ["configurazione", "Configurazione attrezzatura", "Attrezzatura"],
  ["fotografia", "Fotografia subacquea", "Osservazione"],
  ["video", "Video subacqueo", "Osservazione"],
  ["biologia", "Biologia marina", "Osservazione"],
  ["pesci", "Identificazione pesci", "Osservazione"],
  ["conservazione", "Conservazione", "Osservazione"],
  ["navigazione", "Navigazione", "Sicurezza"],
  ["ricerca", "Ricerca e recupero", "Sicurezza"],
  ["soccorso", "Soccorso", "Sicurezza"],
  ["ossigeno", "Primo soccorso e ossigeno", "Sicurezza"],
  ["autonoma", "Immersione autonoma", "Sicurezza"],
].map(([value, label, group]) => ({ value, label, group }));

const TITOLI_SOCCORSO: { value: string; label: string; group: string }[] = [
  ["bls", "BLS", "Rianimazione"],
  ["blsd", "BLS-D", "Rianimazione"],
  ["pbls", "BLS pediatrico", "Rianimazione"],
  ["aed", "AED", "Rianimazione"],
  ["oxygen", "Oxygen Provider", "Ossigeno"],
  ["dan-oxygen", "DAN Oxygen Provider", "Ossigeno"],
  ["dan-oxygen-avanzato", "DAN Advanced Oxygen", "Ossigeno"],
  ["primo-soccorso", "Primo soccorso", "Primo soccorso"],
  ["efr", "Emergency First Response", "Primo soccorso"],
  ["dan-first-aid", "DAN First Aid", "Primo soccorso"],
  ["vita-marina", "Infortuni da vita marina", "Primo soccorso"],
  ["neurologica", "Valutazione neurologica", "Primo soccorso"],
  ["istruttore-blsd", "Istruttore BLS-D", "Insegnamento"],
  ["istruttore-oxygen", "Istruttore Oxygen Provider", "Insegnamento"],
].map(([value, label, group]) => ({ value, label, group }));

const yn = (key: string, label: string): Field => ({ type: "yesno", key, label, required: true });

const DIDATTICHE_NOTE = ["CEDIP", "CMAS", "FIPSAS", "GUE", "NAUI", "PADI", "RAID", "SDI/TDI", "SSI"];

function opzioniDidattica(): { value: string; label: string }[] {
  const nomi = [...DIDATTICHE_NOTE];
  if (!nomi.some((nome) => nome.localeCompare("SNSI", "it", { sensitivity: "accent" }) === 0)) nomi.push("SNSI");
  nomi.sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  return [...nomi, "Altro"].map((value) => ({ value, label: value }));
}

function anniIscrizione(): { value: string; label: string }[] {
  const anno = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()));
  return [anno, anno + 1].map((value) => ({ value: String(value), label: String(value) }));
}

export { anniIscrizione };

function joinName(data: Record<string, string>): string {
  return `${data.cognome ?? ""} ${data.nome ?? ""}`.replace(/\s+/g, " ").trim();
}

export const FORMS: FormDef[] = [
  {
    key: "scheda-socio",
    title: "Scheda socio",
    kicker: "Tesseramento",
    summary: "Anagrafica, contatti di emergenza e consenso al tesseramento dell'ASD.",
    legal: "Iscrizione all'associazione. Dati trattati per la gestione associativa e gli obblighi di legge.",
    audience: ["subacqueo"],
    group: "persone",
    dateKey: "data_iscrizione",
    subject: joinName,
    fields: [
      ...person(),
      { type: "section", title: "Tesseramento" },
      {
        type: "note",
        text: "Scegli se l'iscrizione vale per l'anno in corso o per il successivo. Per rinnovare, invia una nuova scheda allo stesso diving.",
      },
      {
        type: "select",
        key: "anno_iscrizione",
        label: "Anno di iscrizione",
        required: true,
        half: true,
        options: anniIscrizione(),
      },
      { type: "date", key: "data_iscrizione", label: "Data iscrizione", required: true, half: true },
      { type: "text", key: "numero_tessera", label: "N. tessera", half: true, locked: true, hint: "Lo assegna il diving quando accetta la scheda. Non si compila a mano." },
      { type: "section", title: "Contatto in caso di emergenza" },
      { type: "text", key: "emergenza_nome", label: "Nome e cognome", required: true, half: true },
      { type: "tel", key: "emergenza_telefono", label: "Telefono", required: true, half: true },
      { type: "text", key: "emergenza_rapporto", label: "Rapporto", half: true, placeholder: "Partner, genitore…" },
      {
        type: "section",
        title: "Assicurazione personale",
        hint: "Non è un obbligo generale per il subacqueo ricreativo. Molte ASD la chiedono comunque (DAN o altra copertura).",
      },
      { type: "text", key: "assicurazione_compagnia", label: "Compagnia", half: true },
      { type: "text", key: "assicurazione_numero", label: "Numero polizza", half: true },
      { type: "date", key: "assicurazione_scadenza", label: "Scadenza", half: true },
      {
        type: "check",
        key: "consenso_statuto",
        label: "Ho letto lo statuto e chiedo di essere iscritto/a come socio/a.",
        required: true,
      },
      {
        type: "check",
        key: "consenso_privacy",
        label:
          "Acconsento al trattamento dei dati per tesseramento, sicurezza delle immersioni e obblighi di legge.",
        required: true,
      },
      { type: "sign", key: "firma", label: "Firma (nome e cognome)", required: true },
    ],
  },
  {
    key: "registro-immersione",
    title: "Scheda subacqueo",
    kicker: "Immersione",
    summary: "Chi sei, per quale uscita, il brevetto e che gas usi. Il registro del giorno lo compila la scuola.",
    legal:
      "Anagrafica del partecipante e adesione all'uscita. Il registro dell'ASD (art. 12 L. 70/2026) lo tiene la scuola, non questa scheda.",
    audience: ["subacqueo", "istruttore"],
    group: "immersioni",
    dateKey: "data_immersione",
    subject: joinName,
    fields: [
      ...person(),
      { type: "section", title: "Uscita" },
      { type: "section", title: "Brevetto", inline: true },
      {
        type: "select",
        key: "didattica",
        label: "Didattica",
        required: true,
        half: true,
        options: [
          { value: "PADI", label: "PADI" },
          { value: "SSI", label: "SSI" },
          { value: "CMAS", label: "CMAS" },
          { value: "SNSI", label: "SNSI" },
          { value: "Altro", label: "Altra" },
        ],
      },
      { type: "text", key: "livello", label: "Livello", required: true, half: true },
      { type: "text", key: "numero_brevetto", label: "Numero brevetto", required: true, half: true },
      {
        type: "text",
        key: "didattica_specifica",
        label: "Specifica la didattica",
        required: true,
        showWhen: { key: "didattica", equals: "Altro" },
      },
      { type: "section", title: "Uscita", inline: true },
      { type: "periodo", key: "data_immersione", label: "Giorni dell'uscita", required: true },
      {
        type: "select",
        key: "tipo_attivita",
        label: "Tipo",
        required: true,
        half: true,
        options: [
          { value: "Ricreativa", label: "Ricreativa" },
          { value: "Tecnica", label: "Tecnica" },
        ],
      },
      {
        type: "yesno",
        key: "decompressiva",
        label: "Decompressiva",
        required: true,
        showWhen: { key: "tipo_attivita", equals: "Tecnica" },
      },
      { type: "section", title: "Gas di fondo", inline: true },
      {
        type: "select",
        key: "miscela",
        label: "Miscela respiratoria",
        required: true,
        half: true,
        options: [
          { value: "Aria", label: "Aria" },
          { value: "EAN32", label: "Ean 32" },
          { value: "EAN36", label: "Ean 36" },
          { value: "Altra", label: "Altra" },
        ],
      },
      {
        type: "text",
        key: "miscela_specifica",
        label: "Specifica la miscela",
        required: true,
        half: true,
        showWhen: { key: "miscela", equals: "Altra" },
      },
      {
        type: "select",
        key: "autorespiratore",
        label: "Tipo di autorespiratore",
        required: true,
        options: [
          { value: "Circuito aperto", label: "Circuito aperto" },
          { value: "Rebreather", label: "Rebreather" },
        ],
      },
      { type: "text", key: "buddy", label: "Compagno, se lo sai già" },
      { type: "textarea", key: "note", label: "Nota" },
      { type: "section", title: "Contatto in caso di emergenza" },
      { type: "text", key: "emergenza_nome", label: "Nome e cognome", required: true, half: true },
      { type: "tel", key: "emergenza_telefono", label: "Telefono", required: true, half: true },
      {
        type: "check",
        key: "consenso_privacy",
        label: "Acconsento al trattamento dei dati per organizzare l'attività e adempiere agli obblighi di registrazione.",
        required: true,
      },
      { type: "sign", key: "firma", label: "Firma", required: true },
    ],
  },
  {
    key: "questionario-medico",
    title: "Questionario medico",
    kicker: "DAN 2022",
    summary:
      "Modulo medico-subacqueo per il partecipante, versione 2022-02-01 (DAN / RSTC). Non è il certificato del medico.",
    legal:
      "Questionario pubblico Diver Medical Screen Committee, 10346 ITA, 2022-02-01. Una risposta che lo richiede va portata al medico prima del corso o dell'immersione.",
    audience: ["subacqueo", "istruttore"],
    group: "persone",
    dateKey: "data_compilazione",
    subject: joinName,
    fields: [
      { type: "section", title: "Partecipante" },
      { type: "text", key: "cognome", label: "Cognome", required: true, half: true },
      { type: "text", key: "nome", label: "Nome", required: true, half: true },
      { type: "date", key: "data_nascita", label: "Data di nascita", required: true, half: true },
      { type: "text", key: "istruttore", label: "Nome dell'istruttore" },
      { type: "text", key: "struttura", label: "Nome della struttura" },
      {
        type: "note",
        text: "Questionario per l'immersione ricreativa, con autorespiratore o in apnea. Rispondi a tutte le domande in modo veritiero. Se non ti senti bene, non immergerti. Se sei incinta o stai provando a restare incinta, non immergerti.",
      },
      { type: "section", title: "Domande" },
      yn("q1", "Ho avuto problemi a livello polmonare, respiratorio, cardiaco e/o ematologico che hanno influenzato le mie normali prestazioni fisiche o mentali."),
      yn("q2", "Ho più di 45 anni."),
      yn("q3", "Fatico a svolgere esercizio fisico moderato (per esempio camminare 1,6 km in 14 minuti o nuotare 200 metri senza riposare), oppure non sono stato in grado di fare una normale attività fisica negli ultimi 12 mesi."),
      yn("q4", "Ho avuto problemi agli occhi, alle orecchie o ai seni paranasali."),
      yn("q5", "Ho subito un'operazione negli ultimi 12 mesi, oppure ho tuttora problemi dovuti a un passato intervento chirurgico."),
      yn("q6", "Ho perso conoscenza, avuto emicranie, crisi epilettiche, ictus, traumi cranici importanti, o ho una malattia neurologica cronica."),
      yn("q7", "Sono in terapia, o lo sono stato negli ultimi 5 anni, per problemi psicologici, disturbi della personalità, attacchi di panico o una dipendenza da droghe o alcol; oppure mi è stato diagnosticato un disturbo dell'apprendimento o dello sviluppo."),
      yn("q8", "Ho avuto problemi di schiena, ernie, ulcere o diabete."),
      yn("q9", "Ho avuto problemi gastrici o intestinali, compresa una diarrea recente."),
      yn("q10", "Sto assumendo medicinali soggetti a prescrizione medica, esclusi i contraccettivi e gli antimalarici diversi dalla meflochina (Lariam)."),
      { type: "section", title: "Box A", inline: true, showWhen: { key: "q1", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 1." },
      yn("qa1", "Intervento chirurgico al torace, al cuore, alle valvole cardiache, un dispositivo impiantabile (stent, pacemaker, neurostimolatore) o uno pneumotorace."),
      yn("qa2", "Asma, dispnea, allergie gravi, febbre da fieno o vie aeree congestionate negli ultimi 12 mesi, tali da limitare l'attività fisica."),
      yn("qa3", "Problema al cuore: angina, dolore al petto sotto sforzo, insufficienza cardiaca, edema polmonare da immersione, infarto o ictus, oppure farmaci per una condizione cardiaca."),
      yn("qa4", "Bronchite ricorrente e tosse negli ultimi 12 mesi, oppure una diagnosi di enfisema."),
      yn("qa5", "Negli ultimi 30 giorni, sintomi a polmoni, respirazione, cuore o sangue che hanno limitato le prestazioni fisiche o mentali."),
      { type: "section", title: "Box B", inline: true, showWhen: { key: "q2", equals: "si" }, hint: "Solo perché hai più di 45 anni." },
      yn("qb1", "Fumo o inalo nicotina in altri modi."),
      yn("qb2", "Ho un livello alto di colesterolo."),
      yn("qb3", "Ho la pressione arteriosa alta."),
      yn("qb4", "Un consanguineo stretto è morto improvvisamente per malattia cardiaca o ictus prima dei 50 anni, oppure ho familiarità per malattie cardiache prima dei 50 anni."),
      { type: "section", title: "Box C", inline: true, showWhen: { key: "q4", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 4." },
      yn("qc1", "Intervento chirurgico ai seni paranasali negli ultimi 6 mesi."),
      yn("qc2", "Patologia o intervento all'orecchio, perdita di udito o problemi di equilibrio."),
      yn("qc3", "Sinusite ricorrente negli ultimi 12 mesi."),
      yn("qc4", "Chirurgia oculare negli ultimi 3 mesi."),
      { type: "section", title: "Box D", inline: true, showWhen: { key: "q6", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 6." },
      yn("qd1", "Trauma cranico con perdita di coscienza negli ultimi 5 anni."),
      yn("qd2", "Patologia neurologica cronica."),
      yn("qd3", "Emicrania ricorrente negli ultimi 12 mesi, o farmaci per prevenirla."),
      yn("qd4", "Svenimenti o perdita di coscienza, anche parziale, negli ultimi 5 anni."),
      yn("qd5", "Epilessia, crisi convulsive, o farmaci per prevenirle."),
      { type: "section", title: "Box E", inline: true, showWhen: { key: "q7", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 7." },
      yn("qe1", "Problemi comportamentali, mentali o psicologici che richiedono terapia medica o psichiatrica."),
      yn("qe2", "Depressione forte, idee suicidarie, attacchi di panico o disturbo bipolare non controllato, con terapia farmacologica o psichiatrica."),
      yn("qe3", "Diagnosi di malattia mentale o di disturbo dell'apprendimento o dello sviluppo che richiede cura continua o adattamenti."),
      yn("qe4", "Dipendenza da droghe o alcol che ha richiesto terapia negli ultimi 5 anni."),
      { type: "section", title: "Box F", inline: true, showWhen: { key: "q8", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 8." },
      yn("qf1", "Problemi di schiena ricorrenti negli ultimi 6 mesi che limitano la vita quotidiana."),
      yn("qf2", "Intervento alla schiena o alla colonna negli ultimi 12 mesi."),
      yn("qf3", "Diabete controllato con farmaci o dieta, oppure diabete gestazionale negli ultimi 12 mesi."),
      yn("qf4", "Ernia non corretta che limita le abilità fisiche."),
      yn("qf5", "Ulcere attive o non trattate, problemi di cicatrizzazione, o un'operazione per ulcera negli ultimi 6 mesi."),
      { type: "section", title: "Box G", inline: true, showWhen: { key: "q9", equals: "si" }, hint: "Solo perché hai risposto sì alla domanda 9." },
      yn("qg1", "Intervento di stomia, senza autorizzazione medica a nuotare o a fare attività fisica."),
      yn("qg2", "Disidratazione che ha richiesto un intervento medico negli ultimi 7 giorni."),
      yn("qg3", "Ulcere gastriche o intestinali attive non curate, o un'operazione per ulcera negli ultimi 6 mesi."),
      yn("qg4", "Bruciore di stomaco frequente, rigurgito o reflusso (MRGE)."),
      yn("qg5", "Rettocolite ulcerosa o morbo di Crohn, attivi o non controllati."),
      yn("qg6", "Chirurgia bariatrica negli ultimi 12 mesi."),
      { type: "section", title: "Firma del partecipante" },
      {
        type: "note",
        text: "Se hai risposto no a tutte le 10 domande, la visita medica non è richiesta. Se hai risposto sì alle domande 3, 5 o 10, oppure a una domanda dei box, firma comunque e porta il questionario al medico: senza la sua approvazione non si partecipa al corso o all'immersione.",
      },
      {
        type: "check",
        key: "dichiarazione_veritiera",
        label:
          "Ho risposto a tutte le domande in modo veritiero e accetto la responsabilità delle conseguenze se ho risposto in modo errato o se non ho rivelato condizioni mediche attuali o passate.",
        required: true,
      },
      { type: "date", key: "data_compilazione", label: "Data", required: true, half: true },
      { type: "photo", key: "foto_certificato", label: "Foto del certificato medico" },
      { type: "sign", key: "firma", label: "Firma del partecipante, o del genitore o tutore se è minorenne", required: true },
      { type: "section", title: "Valutazione del medico" },
      {
        type: "note",
        text: "Da compilare solo dopo la visita, se il questionario la richiede. Non blocca l'invio delle risposte.",
      },
      {
        type: "select",
        key: "med_esito",
        label: "Esito del medico",
        options: [
          { value: "", label: "Non ancora" },
          { value: "approvato", label: "Approvato: nessuna condizione incompatibile con la subacquea ricreativa" },
          { value: "non-approvato", label: "Non approvato: condizioni incompatibili con la subacquea ricreativa" },
        ],
      },
      { type: "text", key: "med_nome", label: "Nome del medico", half: true },
      { type: "text", key: "med_credenziali", label: "Attestati o credenziali", half: true },
      { type: "text", key: "med_clinica", label: "Clinica o ospedale" },
      { type: "text", key: "med_indirizzo", label: "Indirizzo" },
      { type: "tel", key: "med_telefono", label: "Telefono", half: true },
      { type: "email", key: "med_email", label: "Email", half: true },
      { type: "date", key: "med_data", label: "Data della visita", half: true },
    ],
  },
  {
    key: "brevetto-esperienza",
    title: "Brevetto ed esperienza",
    kicker: "ISO 24803",
    summary: "Brevetto, ultima immersione e specialità, per valutare se l'uscita è adatta.",
    legal:
      "Verifica di competenza prima dell'immersione organizzata (ISO 24803) e annotazione degli estremi del brevetto (art. 12 L. 70/2026).",
    audience: ["subacqueo", "istruttore"],
    group: "persone",
    dateKey: "ultima_immersione",
    subject: joinName,
    fields: [
      { type: "text", key: "cognome", label: "Cognome", required: true, half: true },
      { type: "text", key: "nome", label: "Nome", required: true, half: true },
      {
        type: "select",
        key: "didattica",
        label: "Didattica",
        required: true,
        half: true,
        options: [
          "PADI",
          "SSI",
          "CMAS",
          "FIPSAS",
          "RAID",
          "NAUI",
          "SDI/TDI",
          "CEDIP",
          "GUE",
          "Altra",
        ].map((v) => ({ value: v, label: v })),
      },
      {
        type: "text",
        key: "livello",
        label: "Livello",
        required: true,
        half: true,
        placeholder: "Open Water, 1° grado…",
      },
      { type: "text", key: "numero_brevetto", label: "Numero brevetto", required: true, half: true },
      { type: "date", key: "data_rilascio", label: "Data rilascio", half: true },
      { type: "text", key: "istruttore_rilascio", label: "Istruttore / centro che ha brevettato" },
      { type: "section", title: "Esperienza recente" },
      { type: "date", key: "ultima_immersione", label: "Ultima immersione", required: true, half: true },
      { type: "number", key: "immersioni_totali", label: "Immersioni totali", required: true, half: true },
      { type: "number", key: "immersioni_12_mesi", label: "Negli ultimi 12 mesi", half: true },
      { type: "number", key: "profondita_massima", label: "Profondità massima consentita (m)", half: true },
      { type: "section", title: "Specialità" },
      {
        type: "checks",
        key: "specialita",
        label: "Spunta le specialità che hai",
        options: SPECIALITA,
      },
      { type: "text", key: "specialita_altra", label: "Altra specialità", placeholder: "Se non è nell'elenco" },
      {
        type: "check",
        key: "logbook_disponibile",
        label: "Ho il libretto immersioni (cartaceo o digitale) disponibile per il controllo.",
        required: true,
      },
      { type: "sign", key: "firma", label: "Firma (nome e cognome)", required: true },
      { type: "section", title: "Foto del brevetto" },
      {
        type: "photo",
        key: "foto_brevetto",
        label: "Allega foto brevetto",
        hint: "Carica una foto oppure scegli un brevetto già salvato nella tua area.",
        daBrevetti: true,
      },
    ],
  },
  {
    key: "informativa-consenso",
    title: "Informativa e consenso",
    kicker: "Condotta",
    summary: "Rischi dell'immersione, regole di coppia, rispetto dell'ambiente e firma. Anche per i minori.",
    legal:
      "Informazione sui rischi e sulla tutela degli ecosistemi (L. 70/2026). Per i minori firma chi esercita la responsabilità genitoriale.",
    audience: ["subacqueo"],
    group: "persone",
    dateKey: "data_compilazione",
    subject: joinName,
    whenRequire: [
      {
        when: "minorenne",
        equals: "si",
        require: ["genitore_cognome", "genitore_nome", "genitore_telefono", "firma_genitore"],
      },
    ],
    fields: [
      { type: "text", key: "cognome", label: "Cognome", required: true, half: true },
      { type: "text", key: "nome", label: "Nome", required: true, half: true },
      { type: "date", key: "data_compilazione", label: "Data", required: true, half: true },
      {
        type: "note",
        text: "L'immersione con autorespiratore comporta rischi propri: barotrauma, malattia da decompressione, affaticamento, separazione dal gruppo, mare e meteo che cambiano. Ci si immerge almeno in coppia, nei limiti del brevetto e delle indicazioni della guida. Sui fondali non si tocca e non si preleva nulla.",
      },
      {
        type: "check",
        key: "ho_letto_rischi",
        label: "Ho letto l'informativa sui rischi e posso rinunciare all'immersione in qualsiasi momento.",
        required: true,
      },
      {
        type: "check",
        key: "rispetto_limiti",
        label:
          "Mi immergerò nei limiti del mio brevetto, mai da solo/a, e seguirò briefing e guida.",
        required: true,
      },
      {
        type: "check",
        key: "rispetto_ambiente",
        label: "Rispetterò l'ambiente sommerso: niente contatto, niente prelievi, assetto corretto.",
        required: true,
      },
      {
        type: "check",
        key: "consenso_dati",
        label:
          "Acconsento a conservare questa dichiarazione insieme al registro immersioni per gli obblighi di legge.",
        required: true,
      },
      { type: "sign", key: "firma", label: "Firma del partecipante", required: true },
      { type: "section", title: "Se il partecipante è minorenne" },
      { type: "yesno", key: "minorenne", label: "Il partecipante è minorenne?", required: true },
      { type: "text", key: "genitore_cognome", label: "Cognome di chi firma", half: true },
      { type: "text", key: "genitore_nome", label: "Nome di chi firma", half: true },
      { type: "tel", key: "genitore_telefono", label: "Telefono", half: true },
      {
        type: "sign",
        key: "firma_genitore",
        label: "Firma di chi esercita la responsabilità genitoriale",
      },
    ],
  },
  {
    key: "scheda-istruttore",
    title: "Scheda istruttore o guida",
    kicker: "Art. 11",
    summary:
      "Requisiti per operare: maggiore età, brevetto, certificato medico, polizza RC e primo soccorso.",
    legal:
      "Fascicolo dello staff (art. 11 L. 70/2026 e documentazione del personale ISO 24803). Il certificato medico e la RC non si sostituiscono allegando solo questa scheda: vanno conservati anche i documenti.",
    audience: ["istruttore"],
    group: "staff",
    dateKey: "scadenza_medico",
    subject: (data) => joinName(data) || "Staff",
    fields: [
      { type: "section", title: "Anagrafica" },
      { type: "text", key: "cognome", label: "Cognome", required: true, half: true },
      { type: "text", key: "nome", label: "Nome", required: true, half: true },
      { type: "date", key: "data_nascita", label: "Data di nascita", required: true, half: true },
      { type: "text", key: "cittadinanza", label: "Cittadinanza", required: true, half: true },
      { type: "text", key: "codice_fiscale", label: "Codice fiscale", required: true, half: true },
      { type: "tel", key: "telefono", label: "Telefono", required: true, half: true },
      { type: "email", key: "email", label: "Email", half: true },
      {
        type: "select",
        key: "ruolo",
        label: "Ruolo",
        required: true,
        options: [
          { value: "Istruttore subacqueo", label: "Istruttore subacqueo" },
          { value: "Guida subacquea", label: "Guida subacquea" },
          { value: "Entrambi", label: "Istruttore e guida" },
        ],
      },
      {
        type: "check",
        key: "maggiore_eta",
        label: "Dichiaro di essere maggiorenne.",
        required: true,
      },
      {
        type: "check",
        key: "diritti_civili",
        label: "Dichiaro di godere dei diritti civili e politici.",
        required: true,
      },
      { type: "section", title: "Brevetto professionale" },
      { type: "text", key: "didattica", label: "Organizzazione didattica", required: true, half: true },
      { type: "text", key: "livello", label: "Livello", required: true, half: true },
      { type: "text", key: "numero_brevetto", label: "Numero", required: true, half: true },
      { type: "date", key: "data_brevetto", label: "Data rilascio", half: true },
      { type: "textarea", key: "mansioni", label: "Mansioni assegnate nell'ASD", required: true },
      { type: "section", title: "Certificato medico" },
      {
        type: "select",
        key: "tipo_medico",
        label: "Tipo",
        required: true,
        options: [
          { value: "Idoneità non agonistica", label: "Idoneità non agonistica" },
          { value: "Idoneità all'attività subacquea", label: "Idoneità all'attività subacquea" },
          { value: "Agonistico", label: "Agonistico" },
        ],
      },
      { type: "text", key: "medico", label: "Medico o struttura", required: true, half: true },
      { type: "date", key: "rilascio_medico", label: "Rilascio", half: true },
      { type: "date", key: "scadenza_medico", label: "Scadenza", required: true, half: true },
      { type: "section", title: "Polizza responsabilità civile" },
      { type: "text", key: "compagnia_rc", label: "Compagnia", required: true, half: true },
      { type: "text", key: "numero_rc", label: "Numero polizza", required: true, half: true },
      { type: "text", key: "massimale_rc", label: "Massimale", half: true, placeholder: "es. 1.500.000 €" },
      { type: "date", key: "scadenza_polizza", label: "Scadenza", required: true, half: true },
      {
        type: "check",
        key: "rc_terzi",
        label: "La polizza copre la responsabilità verso terzi e i rischi dell'attività di istruttore o guida.",
        required: true,
      },
      { type: "section", title: "Primo soccorso" },
      {
        type: "checks",
        key: "primo_soccorso",
        label: "Titoli",
        required: true,
        options: TITOLI_SOCCORSO,
      },
      { type: "text", key: "titolo_altro", label: "Altro titolo", placeholder: "Se non è nell'elenco" },
      { type: "date", key: "scadenza_soccorso", label: "Scadenza abilitazione", half: true },
      { type: "sign", key: "firma", label: "Firma", required: true },
    ],
  },
  {
    key: "registro-attrezzatura",
    title: "Registro manutenzione attrezzatura",
    kicker: "Collaudo",
    summary: "Bombola, erogatore, GAV, unità ossigeno: intervento, esito e prossima scadenza.",
    legal:
      "Registro di collaudo e manutenzione (art. 11 L. 70/2026). Le attrezzature del centro restano conformi alle norme UE e in stato di funzionamento. Le scadenze dei recipienti a pressione seguono la normativa sul caso concreto, non un intervallo inventato qui.",
    audience: ["istruttore"],
    group: "attrezzatura",
    dateKey: "data_intervento",
    subject: (data) =>
      [data.categoria, data.marca, data.matricola].filter(Boolean).join(" · ") || "Attrezzatura",
    fields: [
      {
        type: "select",
        key: "categoria",
        label: "Categoria",
        required: true,
        options: [
          "Bombola",
          "Erogatore 1° stadio",
          "2° stadio",
          "Octopus",
          "Manometro / console",
          "GAV",
          "Muta",
          "Computer",
          "Unità ossigeno",
          "Cassetta pronto soccorso",
          "Altro",
        ].map((v) => ({ value: v, label: v })),
      },
      { type: "text", key: "marca", label: "Marca", required: true, half: true },
      { type: "text", key: "modello", label: "Modello", half: true },
      { type: "text", key: "matricola", label: "Matricola", required: true, half: true },
      {
        type: "select",
        key: "proprieta",
        label: "Proprietà",
        required: true,
        half: true,
        options: [
          { value: "ASD", label: "ASD" },
          { value: "Noleggio", label: "Noleggio" },
          { value: "Personale staff", label: "Personale staff" },
        ],
      },
      { type: "date", key: "data_acquisto", label: "Data acquisto o messa in servizio", half: true },
      { type: "section", title: "Intervento" },
      { type: "date", key: "data_intervento", label: "Data intervento", required: true, half: true },
      {
        type: "select",
        key: "tipo_intervento",
        label: "Tipo",
        required: true,
        half: true,
        options: [
          "Collaudo periodico",
          "Revisione",
          "Controllo visivo",
          "Messa in servizio",
          "Fuori servizio",
        ].map((v) => ({ value: v, label: v })),
      },
      { type: "text", key: "officina", label: "Officina o tecnico", half: true },
      {
        type: "select",
        key: "esito",
        label: "Esito",
        required: true,
        half: true,
        options: [
          { value: "Idoneo", label: "Idoneo" },
          { value: "Da revisionare", label: "Da revisionare" },
          { value: "Fuori servizio", label: "Fuori servizio" },
        ],
      },
      { type: "date", key: "prossima_scadenza", label: "Prossima scadenza", required: true, half: true },
      { type: "textarea", key: "note", label: "Note" },
      { type: "text", key: "firma", label: "Registrato da", required: true },
    ],
  },
];

export function campiMancanti(form: FormDef, data: Record<string, string>, solo?: Set<string>): string[] {
  const labelCount = new Map<string, number>();
  for (const field of form.fields) {
    if ("label" in field) labelCount.set(field.label, (labelCount.get(field.label) ?? 0) + 1);
  }
  const missing: string[] = [];
  let section = "";
  let sectionVisible = true;
  for (const field of form.fields) {
    if (field.type === "section") {
      section = field.title;
      sectionVisible = !field.showWhen || (data[field.showWhen.key] ?? "") === field.showWhen.equals;
      continue;
    }
    if (!sectionVisible) continue;
    if ("showWhen" in field && field.showWhen && (data[field.showWhen.key] ?? "") !== field.showWhen.equals) continue;
    if (field.type === "note" || !("required" in field) || !field.required || !("key" in field)) continue;
    if (solo && !solo.has(field.key)) continue;
    const value = (data[field.key] ?? "").trim();
    const nome = (labelCount.get(field.label) ?? 0) > 1 && section ? `${field.label} · ${section}` : field.label;
    if (field.type === "yesno") {
      if (value !== "si" && value !== "no") missing.push(nome);
    } else if (field.type === "check") {
      if (value !== "si") missing.push(nome);
    } else if (!value) missing.push(nome);
  }
  if (form.key === "registro-immersione" && (!solo || solo.has("decompressiva"))) {
    for (const item of mancaDecompressiva(data)) {
      if (!missing.includes(item)) missing.push(item);
    }
  }
  for (const rule of form.whenRequire ?? []) {
    if ((data[rule.when] ?? "") !== rule.equals) continue;
    for (const key of rule.require) {
      if (solo && !solo.has(key)) continue;
      if (!(data[key] ?? "").trim()) {
        const field = form.fields.find((item) => "key" in item && item.key === key);
        missing.push(field && "label" in field ? field.label : key);
      }
    }
  }
  return missing;
}

const MAX_DECOMPRESSIVE = 8;

export function svuotaDecompressive(data: Record<string, string>) {
  delete data.numero_decompressive;
  for (const key of Object.keys(data)) {
    if (key.startsWith("decompressiva_gas_") || key.startsWith("decompressiva_miscela_")) delete data[key];
  }
}

export function mancaDecompressiva(data: Record<string, string>): string[] {
  if (data.tipo_attivita !== "Tecnica" || data.decompressiva !== "si") return [];
  const raw = Number(data.numero_decompressive);
  if (!Number.isInteger(raw) || raw < 1) return ["Numero di decompressive"];
  const n = Math.min(MAX_DECOMPRESSIVE, raw);
  const missing: string[] = [];
  for (let i = 1; i <= n; i++) {
    const gas = (data[`decompressiva_gas_${i}`] ?? "").trim();
    if (gas !== "EAN50" && gas !== "Ossigeno" && gas !== "Altra") missing.push(`Gas della decompressiva ${i}`);
    else if (gas === "Altra" && !(data[`decompressiva_miscela_${i}`] ?? "").trim()) missing.push(`Miscela della decompressiva ${i}`);
  }
  return missing;
}

export function tieniDecompressive(source: Record<string, unknown>, data: Record<string, string>) {
  if (data.tipo_attivita !== "Tecnica" || data.decompressiva !== "si") return;
  const scritto = source.numero_decompressive;
  const raw = Number(typeof scritto === "string" ? scritto : data.numero_decompressive);
  if (!Number.isInteger(raw) || raw < 1) return;
  const n = Math.min(MAX_DECOMPRESSIVE, raw);
  data.numero_decompressive = String(n);
  for (let i = 1; i <= n; i++) {
    const gasRaw = source[`decompressiva_gas_${i}`];
    const gas = typeof gasRaw === "string" ? gasRaw.trim() : "";
    if (gas !== "EAN50" && gas !== "Ossigeno" && gas !== "Altra") continue;
    data[`decompressiva_gas_${i}`] = gas;
    if (gas !== "Altra") continue;
    const mixRaw = source[`decompressiva_miscela_${i}`];
    const mix = typeof mixRaw === "string" ? mixRaw.trim().slice(0, 80) : "";
    if (mix) data[`decompressiva_miscela_${i}`] = mix;
  }
}

export const CAMPI_CHIUSI = [
  "codice_fiscale",
  "numero_documento",
  "tipo_documento",
  "emergenza_nome",
  "emergenza_telefono",
  "emergenza_rapporto",
  "assicurazione_numero",
  "numero_rc",
] as const;

export function haCampiChiusi(form: FormDef): boolean {
  return form.fields.some((field) => "key" in field && (CAMPI_CHIUSI as readonly string[]).includes(field.key));
}

export function formByKey(key: string): FormDef | null {
  const found = FORMS.find((form) => form.key === key);
  if (found) return found;
  if (key === "scheda-cliente") return FORMS.find((form) => form.key === "registro-immersione") ?? null;
  return null;
}

export function formsForRole(role: Role): FormDef[] {
  if (isStaff(role)) return FORMS;
  if (role === "piattaforma") return [];
  return FORMS.filter((form) => form.audience.includes(role));
}

export function subjectOf(form: FormDef, data: Record<string, string>): string {
  const value = form.subject(data).replace(/\s+/g, " ").trim();
  return (value || "Senza nominativo").slice(0, 180);
}

export function keysForGroup(group: string | undefined): string[] | null {
  if (!group || group === "tutti") return null;
  const keys = FORMS.filter((form) => form.group === group).map((form) => form.key);
  if (group === "immersioni") keys.push("scheda-cliente");
  return keys.length ? keys : null;
}

export function chiaveSanitaria(key: string): boolean {
  return key.startsWith("q_") || key.startsWith("med_") || key === "firma" || key === "dichiarazione_veritiera" || key === "data_nascita" || key === "foto_certificato" || key === "foto_certificato_nome";
}

export function medicalAlert(data: Record<string, string>): boolean {
  if (data.q3 === "si" || data.q5 === "si" || data.q10 === "si") return true;
  return Object.entries(data).some(([key, value]) => /^q[a-g]\d/.test(key) && value === "si");
}

export const CHECKLIST: Record<Role, string[]> = {
  subacqueo: [
    "scheda-socio",
    "registro-immersione",
    "questionario-medico",
    "brevetto-esperienza",
    "informativa-consenso",
  ],
  istruttore: ["scheda-istruttore"],
  scuola: ["scheda-istruttore"],
  piattaforma: [],
};

const PREFILL_DATES = new Set([
  "data_attivita",
  "data_iscrizione",
  "data_intervento",
  "data_compilazione",
]);

export function emptyData(
  form: FormDef,
  seed: { cognome?: string; nome?: string; telefono?: string; email?: string; centro?: string; oggi?: string },
): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.type === "section" || field.type === "note") continue;
    data[field.key] = "";
  }
  if ("cognome" in data && seed.cognome) data.cognome = seed.cognome;
  if ("nome" in data && seed.nome) data.nome = seed.nome;
  if ("telefono" in data && seed.telefono) data.telefono = seed.telefono;
  if ("email" in data && seed.email) data.email = seed.email;
  if ("centro" in data && seed.centro) data.centro = seed.centro;
  if (form.dateKey && seed.oggi && PREFILL_DATES.has(form.dateKey)) data[form.dateKey] = seed.oggi;
  if ("tipo_documento" in data) data.tipo_documento = "Carta di identità";
  return data;
}
