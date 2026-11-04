export const FINE_PROVA = "2027-03-31";

export type RuoloAbb = "" | "sub" | "staff" | "titolare";
export type PianoSub = "" | "trial" | "free" | "pro";
export type PianoDiving = "" | "trial" | "active" | "sospeso";

export type Abbonamento = {
  ruolo: RuoloAbb;
  proAperto: boolean;
  scuolaAperta: boolean;
  chiusura: "prova" | "prezzo";
  riga: string;
};

export function entroProva(oggi: string, fino: string): boolean {
  return Boolean(fino) && fino >= oggi;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function dataProva(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const mese = MESI[Number(match[2]) - 1];
  if (!mese) return iso;
  return `${Number(match[3])} ${mese} ${match[1]}`;
}

export function rigaProva(input: {
  ruolo: RuoloAbb;
  piano: PianoSub;
  provaFino: string;
  scuolaPiano: PianoDiving;
  scuolaProvaFino: string;
  oggi: string;
}): string {
  if (input.ruolo === "sub" && input.piano === "trial" && entroProva(input.oggi, input.provaFino)) {
    return `Prova Pro fino al ${dataProva(input.provaFino)}`;
  }
  if ((input.ruolo === "staff" || input.ruolo === "titolare") && input.scuolaPiano === "trial" && entroProva(input.oggi, input.scuolaProvaFino)) {
    return `Pro incluso fino al ${dataProva(input.scuolaProvaFino)}`;
  }
  return "";
}

export function nascitaSub(oggi: string): { piano: "trial" | "free"; provaFino: string } {
  if (oggi <= FINE_PROVA) return { piano: "trial", provaFino: FINE_PROVA };
  return { piano: "free", provaFino: "" };
}

export function nascitaDiving(oggi: string): { piano: "trial" | ""; provaFino: string } {
  if (oggi <= FINE_PROVA) return { piano: "trial", provaFino: FINE_PROVA };
  return { piano: "", provaFino: "" };
}

export function calcolaAbbonamento(input: {
  ruolo: RuoloAbb;
  piano: PianoSub;
  provaFino: string;
  scuolaPiano: PianoDiving;
  scuolaProvaFino: string;
  haScuola: boolean;
  oggi: string;
  esente?: boolean;
}): Abbonamento {
  if (input.esente) {
    return { ruolo: input.ruolo, proAperto: true, scuolaAperta: true, chiusura: "prezzo", riga: "" };
  }
  const scuolaAperta =
    input.haScuola &&
    (input.scuolaPiano === "active" || (input.scuolaPiano === "trial" && entroProva(input.oggi, input.scuolaProvaFino)));
  const classificato = input.ruolo === "sub" || input.ruolo === "staff" || input.ruolo === "titolare";
  let proAperto = true;
  let provaRiferimento = input.provaFino;
  if (classificato && input.ruolo === "sub") {
    proAperto = input.piano === "pro" || (input.piano === "trial" && entroProva(input.oggi, input.provaFino));
  } else if (classificato) {
    proAperto = scuolaAperta;
    provaRiferimento = input.scuolaProvaFino;
  }
  const chiusura = input.oggi <= FINE_PROVA || entroProva(input.oggi, provaRiferimento) ? "prova" : "prezzo";
  return {
    ruolo: input.ruolo,
    proAperto,
    scuolaAperta,
    chiusura,
    riga: rigaProva(input),
  };
}
