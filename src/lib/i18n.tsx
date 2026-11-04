import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { formatDay, impostaLocaleFormato } from "@/lib/format";
import { EN_ERRORI } from "@/lib/i18n/en/errori";
import { EN_MODULI } from "@/lib/i18n/en/moduli";
import { EN_SCUOLA } from "@/lib/i18n/en/scuola";
import { EN_SHELL } from "@/lib/i18n/en/shell";
import { EN_SUB } from "@/lib/i18n/en/sub";
import { EN_TESTI } from "@/lib/i18n/en/testi";

export type Lingua = "it" | "en";
export type Traduci = (it: string, vars?: Record<string, string | number>) => string;

const SIGLE = new Set(["PADI", "SSI", "SNSI", "CMAS", "FIPSAS", "RAID", "NAUI", "SDI/TDI", "CEDIP", "GUE"]);

const EN: Record<string, string> = {
  ...EN_ERRORI,
  ...EN_SHELL,
  ...EN_SCUOLA,
  ...EN_SUB,
  ...EN_MODULI,
  ...EN_TESTI,
  "Prova Pro fino al {data}": "Pro trial until {data}",
  "Pro incluso fino al {data}": "Pro included until {data}",
  "Prova fino al {data}": "Trial until {data}",
  "{brevetto}, profondità non indicata": "{brevetto}, depth not stated",
  "{brevetto}, {metri} m": "{brevetto}, {metri} m",
  "A {chi} manca {cosa}.": "{chi} is missing {cosa}.",
  "{chi} non può uscire. {motivo}.": "{chi} cannot go out. {motivo}.",
  "Compila i campi obbligatori: {campi}": "Fill in the required fields: {campi}",
  "Controlla la data: {etichetta}.": "Check the date: {etichetta}.",
  "Il gas {n} supera il 100%.": "Gas {n} is over 100%.",
  "{etichetta}: indica un numero tra {min} e {max}.": "{etichetta}: enter a number between {min} and {max}.",
  "A {guida} non hai assegnato nessuno. Toglila, oppure aggiungi i subacquei.": "You have assigned nobody to {guida}. Remove them, or add the divers.",
  "Oltre 6 subacquei per {guida}. Scrivi perché, almeno una frase.": "More than 6 divers for {guida}. Write why, at least a sentence.",
  "Il brevetto «{titolo}» è scaduto il {data}.": "The certification «{titolo}» expired on {data}.",
  "Il brevetto «{titolo}» scade il {data}.": "The certification «{titolo}» expires on {data}.",
  "Il certificato medico «{titolo}» è scaduto il {data}.": "The medical certificate «{titolo}» expired on {data}.",
  "Il certificato medico «{titolo}» scade il {data}.": "The medical certificate «{titolo}» expires on {data}.",
  "L'assicurazione «{titolo}» è scaduta il {data}.": "The insurance «{titolo}» expired on {data}.",
  "L'assicurazione «{titolo}» scade il {data}.": "The insurance «{titolo}» expires on {data}.",
  "Il collaudo di «{titolo}» è scaduto il {data}.": "The service of «{titolo}» expired on {data}.",
  "Il collaudo di «{titolo}» scade il {data}.": "The service of «{titolo}» is due on {data}.",
  "Titolare del trattamento dell'account, del logbook e dei Tools è {chi}.": "The controller for the account, the logbook and the Tools is {chi}.",
  "Lingua": "Language",
  "Italiano": "Italiano",
  "English": "English",
  "Lingua non valida.": "Language is not valid.",
  "Non salvato.": "Not saved.",
  "Scogliera · 12 m": "Reef · 12 m",
  "Mare Blu": "Blue Sea",
  "Blu Profondo": "Deep Blue",
  "Importa logbook": "Import logbook",
  "Esporta logbook": "Export logbook",
  "Scegli un file UDDF o .fit": "Choose a UDDF or .fit file",
  "Il file non è un UDDF né un .fit leggibile.": "The file is not a readable UDDF or .fit file.",
  "Da un .fit si leggono solo le immersioni, non le altre attività.": "A .fit file only contributes dives, not other activities.",
  "Il file scaricato è UDDF.": "The downloaded file is UDDF.",
  "Nessuna immersione nel file.": "No dives in the file.",
  "Nessuna immersione con una data.": "No dives with a date.",
  "File troppo grande.": "The file is too large.",
  "Già nel logbook": "Already in the logbook",
  "Stessa data e ora": "Same date and time",
  "Salva le selezionate": "Save the selected ones",
  "Tutto il logbook": "The whole logbook",
  "Solo le selezionate": "Only the selected ones",
  "Scarica il file": "Download the file",
  "Scegli almeno un'immersione.": "Choose at least one dive.",
  "Nessuna immersione da esportare.": "No dives to export.",
  "Importate {n}.": "Imported {n}.",
  "{n} erano già nel logbook e non sono state copiate.": "{n} were already in the logbook and were not copied.",
  "Sito non indicato": "Site not stated",
  "Profondità non indicata": "Depth not stated",
  "Durata non indicata": "Duration not stated",
  "con profilo": "with profile",
  "{n} senza data, non in elenco.": "{n} with no date, not listed.",
  "{n} immersioni in più non sono in questa anteprima.": "{n} further dives are not in this preview.",
  "Anteprima. Salvi solo quelle che confermi. Le immersioni già scritte restano.": "Preview. Only the ones you confirm are saved. Dives already written stay.",
  "Stessa data e stessa ora di una già presente non viene copiata.": "A dive with the same date and time as one already here is not copied.",
  "Solo le immersioni di questo account: data, sito, profondità, durata e profilo se c'è.": "Only this account's dives: date, site, maximum depth, duration and the profile if there is one.",
  "Qui si scelgono le ultime 500. Tutto il logbook scarica anche le più vecchie.": "The choice here is the latest 500. The whole logbook also downloads the older ones.",
  "Non salvate.": "Not saved.",
  "Preparo…": "Preparing…",
};

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

let linguaModulo: Lingua = "it";

export function linguaAttuale(): Lingua {
  return linguaModulo;
}

function impostaLinguaModulo(lingua: Lingua) {
  linguaModulo = lingua;
  impostaLocaleFormato(lingua);
}

function sostituisci(testo: string, vars: Record<string, string | number>): string {
  return testo.replace(/\{([a-zA-Z0-9_]+)\}/g, (all, key) => (vars[key] == null ? all : String(vars[key])));
}

function isoDaItaliano(text: string): string | null {
  const match = /^(\d{1,2}) ([a-zà]+) (\d{4})$/i.exec(text.trim());
  if (!match) return null;
  const mese = MESI.indexOf(match[2].toLowerCase());
  if (mese < 0) return null;
  return `${match[3]}-${String(mese + 1).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
}

function dataInglese(text: string): string {
  const iso = isoDaItaliano(text);
  return iso ? formatDay(iso) : text;
}

function traduciFrammenti(lingua: Lingua, testo: string): string {
  return testo
    .split(", ")
    .map((piece) => traduci(lingua, piece.trim()))
    .join(", ");
}

function daModello(lingua: Lingua, it: string): string | null {
  const prova = /^Prova Pro fino al (.+)$/.exec(it);
  if (prova) return traduci(lingua, "Prova Pro fino al {data}", { data: dataInglese(prova[1]) });
  const incluso = /^Pro incluso fino al (.+)$/.exec(it);
  if (incluso) return traduci(lingua, "Pro incluso fino al {data}", { data: dataInglese(incluso[1]) });
  const manca = /^A (.+) manca (.+)\.$/.exec(it);
  if (manca) return traduci(lingua, "A {chi} manca {cosa}.", { chi: manca[1], cosa: traduciFrammenti(lingua, manca[2]) });
  const uscire = /^(.+) non può uscire\. (.+)\.$/.exec(it);
  if (uscire) return traduci(lingua, "{chi} non può uscire. {motivo}.", { chi: uscire[1], motivo: traduci(lingua, uscire[2]) });
  const campi = /^Compila i campi obbligatori: (.+)$/.exec(it);
  if (campi) return traduci(lingua, "Compila i campi obbligatori: {campi}", { campi: traduciFrammenti(lingua, campi[1]) });
  const data = /^Controlla la data: (.+)\.$/.exec(it);
  if (data) return traduci(lingua, "Controlla la data: {etichetta}.", { etichetta: traduci(lingua, data[1]) });
  const gas = /^Il gas (\d+) supera il 100%\.$/.exec(it);
  if (gas) return traduci(lingua, "Il gas {n} supera il 100%.", { n: gas[1] });
  const numero = /^(.+): indica un numero tra (.+) e (.+)\.$/.exec(it);
  if (numero) return traduci(lingua, "{etichetta}: indica un numero tra {min} e {max}.", { etichetta: traduci(lingua, numero[1]), min: numero[2], max: numero[3] });
  const nessuno = /^A (.+) non hai assegnato nessuno\. Toglila, oppure aggiungi i subacquei\.$/.exec(it);
  if (nessuno) return traduci(lingua, "A {guida} non hai assegnato nessuno. Toglila, oppure aggiungi i subacquei.", { guida: nessuno[1] });
  const oltre = /^Oltre 6 subacquei per (.+)\. Scrivi perché, almeno una frase\.$/.exec(it);
  if (oltre) return traduci(lingua, "Oltre 6 subacquei per {guida}. Scrivi perché, almeno una frase.", { guida: oltre[1] });
  const iscrizione = /^(.+) · (Subacqueo|Staff|Titolare)$/.exec(it);
  if (iscrizione) return `${iscrizione[1]} · ${traduci(lingua, iscrizione[2])}`;
  const socioIn = /^(.+) ha inviato la Scheda socio\. Accettala per assegnare il numero\.$/.exec(it);
  if (socioIn) return traduci(lingua, "{chi} ha inviato la Scheda socio. Accettala per assegnare il numero.", { chi: socioIn[1] });
  const socioOkAnno = /^(.+) ti ha accettato come socio per il (\d{4})\. Numero scheda: (\d+)\.$/.exec(it);
  if (socioOkAnno) return traduci(lingua, "{club} ti ha accettato come socio per il {anno}. Numero scheda: {n}.", { club: socioOkAnno[1], anno: socioOkAnno[2], n: socioOkAnno[3] });
  const socioOk = /^(.+) ti ha accettato come socio\. Numero scheda: (\d+)\.$/.exec(it);
  if (socioOk) return traduci(lingua, "{club} ti ha accettato come socio. Numero scheda: {n}.", { club: socioOk[1], n: socioOk[2] });
  const socioNo = /^(.+) non ha accettato la Scheda socio\.$/.exec(it);
  if (socioNo) return traduci(lingua, "{club} non ha accettato la Scheda socio.", { club: socioNo[1] });
  const tessera = /^(.+) · anno (\d{4})\. La tessera scade il 31\/12\/\d{4}\. Puoi rinnovare con una nuova Scheda socio\.$/.exec(it);
  if (tessera) return traduci(lingua, "{club} · anno {anno}. La tessera scade il 31/12/{anno}. Puoi rinnovare con una nuova Scheda socio.", { club: tessera[1], anno: tessera[2] });
  const pubblicata = /^(.+) ha pubblicato «([^»]*)»\.\n([\s\S]*)$/.exec(it);
  if (pubblicata) return traduci(lingua, "{club} ha pubblicato «{titolo}».\n{testo}", { club: pubblicata[1], titolo: pubblicata[2], testo: pubblicata[3] });
  return null;
}

export function traduci(lingua: Lingua, it: string, vars?: Record<string, string | number>): string {
  if (!it) return it;
  if (vars) {
    const template = lingua === "en" ? (EN[it] ?? it) : it;
    return sostituisci(template, vars);
  }
  if (lingua !== "en") return it;
  if (EN[it]) return EN[it];
  return daModello(lingua, it) ?? it;
}

export function tOra(it: string, vars?: Record<string, string | number>): string {
  return traduci(linguaModulo, it, vars);
}

export function tScelta(label: string, t: Traduci = tOra): string {
  if (SIGLE.has(label)) return label;
  return t(label);
}

export function messaggioErrore(reason: unknown, fallback: string): string {
  const raw = reason instanceof Error && reason.message ? reason.message : fallback;
  return tOra(raw);
}

const LinguaContext = createContext<{ lingua: Lingua; setLingua: (next: Lingua) => void }>({
  lingua: "it",
  setLingua: () => undefined,
});

export function LinguaProvider({ children }: { children: ReactNode }) {
  const [lingua, setLinguaState] = useState<Lingua>("it");

  const setLingua = useCallback((next: Lingua) => {
    const clean: Lingua = next === "en" ? "en" : "it";
    try {
      localStorage.setItem("tritone-lingua", clean);
    } catch {
      /* il telefono può bloccare la memoria locale */
    }
    setLinguaState(clean);
  }, []);

  impostaLinguaModulo(lingua);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tritone-lingua");
      if (saved === "en" || saved === "it") setLinguaState(saved);
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lingua === "en" ? "en" : "it";
  }, [lingua]);

  return <LinguaContext.Provider value={{ lingua, setLingua }}>{children}</LinguaContext.Provider>;
}

export function useLingua(): { lingua: Lingua; setLingua: (next: Lingua) => void } {
  return useContext(LinguaContext);
}

export function useT(): Traduci {
  const { lingua } = useContext(LinguaContext);
  return useCallback((it: string, vars?: Record<string, string | number>) => traduci(lingua, it, vars), [lingua]);
}
