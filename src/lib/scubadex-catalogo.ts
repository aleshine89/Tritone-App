import csv from "./scubadex-catalogo.csv?raw";
import { APPROFONDIMENTI } from "./scubadex-approfondimenti";

export type SpecieCatalogo = {
  id: string;
  raggruppamento: string;
  nomeComune: string;
  nomeScientifico: string;
  doveVive: string;
  cosaMangia: string;
  doveAvvistarlo: string;
  dimorfismo: string;
  dimensioni: string;
  curiosita: string;
};

function colonne(riga: string): string[] {
  const cols = riga.split(",");
  if (cols.length === 10) cols.splice(7, 2, `${cols[7]},${cols[8]}`);
  return cols;
}

function leggi(): SpecieCatalogo[] {
  const righe = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((riga) => riga.trim().length > 0);
  return righe.slice(1).flatMap((riga) => {
    const cols = colonne(riga);
    if (cols.length !== 9) return [];
    const [raggruppamento, nomeComune, nomeScientifico, doveVive, cosaMangia, doveAvvistarlo, dimorfismo, dimensioni, curiosita] = cols.map((c) => c.trim());
    if (!nomeScientifico) return [];
    const extra = APPROFONDIMENTI[nomeScientifico];
    return [{
      id: nomeScientifico,
      raggruppamento,
      nomeComune,
      nomeScientifico,
      doveVive,
      cosaMangia,
      doveAvvistarlo,
      dimorfismo: extra?.dimorfismo ?? dimorfismo,
      dimensioni,
      curiosita: extra?.curiosita ?? curiosita,
    }];
  });
}

export const CATALOGO_SCUBADEX: SpecieCatalogo[] = leggi();

export function specieNelCatalogo(id: string): boolean {
  return CATALOGO_SCUBADEX.some((item) => item.id === id);
}

export function schedaCatalogo(nome: string): SpecieCatalogo | null {
  const key = nome.trim().toLowerCase();
  if (!key) return null;
  return CATALOGO_SCUBADEX.find((item) => item.nomeScientifico.toLowerCase() === key || item.nomeComune.toLowerCase() === key || item.id.toLowerCase() === key) ?? null;
}

export function categorieCatalogo(): string[] {
  return [...new Set(CATALOGO_SCUBADEX.map((item) => item.raggruppamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
}
