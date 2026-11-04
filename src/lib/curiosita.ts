export type Tema = "In acqua" | "Biologia marina" | "Fisiologia";

export type Nota = {
  tema: Tema;
  testo: string;
};

export const AL_GIORNO = 5;

const IN_ACQUA: Nota[] = [
  { tema: "In acqua", testo: "Ogni 10 metri di profondità la pressione aumenta di 1 bar. A 20 metri è già il triplo rispetto alla superficie." },
  { tema: "In acqua", testo: "A 10 metri i rossi spariscono per primi. Per rivederli serve la luce di una torcia." },
  { tema: "In acqua", testo: "La regola più utile resta questa: non trattenere mai il respiro in risalita." },
  { tema: "In acqua", testo: "Una sosta di 3 minuti a 5 metri, anche dopo un tuffo tranquillo, aiuta a scaricare l'azoto." },
  { tema: "In acqua", testo: "L'acqua di mare è circa 800 volte più densa dell'aria. Per questo ogni pinneggiata conta." },
  { tema: "In acqua", testo: "Il suono sott'acqua viaggia circa quattro volte più velocemente che in aria: è difficile capire da dove arriva." },
  { tema: "In acqua", testo: "Un colpo sulla bombola si sente da molto più lontano di una voce. Sott'acqua non si grida." },
  { tema: "In acqua", testo: "La maschera appanna perché l'aria che espiri è più calda dell'acqua. Un velo di saliva sul vetro, prima di entrare, aiuta." },
  { tema: "In acqua", testo: "Il GAV non è un ascensore. Ci si assetta con poca aria e la risalita si controlla con il respiro." },
  { tema: "In acqua", testo: "Il Nitrox non serve a scendere più a fondo: serve a restare più a lungo, con meno azoto, entro la profondità massima." },
  { tema: "In acqua", testo: "Oltre una certa profondità l'ossigeno diventa tossico. Per questo ogni miscela ha un limite." },
  { tema: "In acqua", testo: "Si consuma più aria se si è agitati, se si ha freddo o se si pinneggia di continuo. La calma fa durare la bombola." },
  { tema: "In acqua", testo: "L'orecchio va compensato presto e spesso, già dal primo metro, prima che faccia male." },
  { tema: "In acqua", testo: "La mezza maschera si svuota guardando in alto ed espirando piano dal naso. Si impara prima in pochi metri, non a 20 metri." },
  { tema: "In acqua", testo: "Il computer segna il profilo, ma la decisione di risalire resta tua e del compagno." },
  { tema: "In acqua", testo: "Dopo un'immersione è meglio non volare. Si aspetta almeno mezza giornata, di più se i tuffi sono stati più di uno." },
  { tema: "In acqua", testo: "Il compagno non è facoltativo: in due si controlla il gas e si esce dall'acqua insieme." },
  { tema: "In acqua", testo: "La bombola non si lascia mai in piedi da sola. Se cade, la rubinetteria non perdona." },
  { tema: "In acqua", testo: "Appena stacchi l'erogatore, il filtro del primo stadio va coperto. Un granello di sabbia basta a rovinarlo." },
  { tema: "In acqua", testo: "Dopo il tuffo l'attrezzatura si sciacqua con acqua dolce. Il sale, se resta, corrode." },
  { tema: "In acqua", testo: "Il segno OK sott'acqua è una domanda e una risposta. Si fa spesso, non solo quando qualcosa non va." },
  { tema: "In acqua", testo: "Se perdi il gruppo, risali piano, fai la sosta se è prevista e aspetta in superficie. Non cercarlo in profondità." },
  { tema: "In acqua", testo: "La bandiera rossa con la striscia bianca significa che ci sono sub in acqua. Barche e moto d'acqua stanno larghe." },
  { tema: "In acqua", testo: "L'immersione sicura comincia a terra: attrezzatura controllata, gas sufficiente, piano detto ad alta voce." },
  { tema: "In acqua", testo: "In profondità l'azoto può dare euforia. Se viene da ridere senza motivo, è ora di risalire un poco." },
];

const BIOLOGIA: Nota[] = [
  { tema: "Biologia marina", testo: "La posidonia non è un'alga: è una pianta. Una prateria sana produce ossigeno e fa da nido ai piccoli pesci." },
  { tema: "Biologia marina", testo: "La murena apre e chiude la bocca per respirare, non perché voglia mordere." },
  { tema: "Biologia marina", testo: "Una cernia curiosa si avvicina se resti fermo. Se le nuoti incontro, sparisce nella tana." },
  { tema: "Biologia marina", testo: "Nel corso della vita una cernia può passare da femmina a maschio, e restare fedele alla stessa tana per anni." },
  { tema: "Biologia marina", testo: "Il polpo ha tre cuori e il sangue blu, perché trasporta l'ossigeno con il rame invece che con il ferro." },
  { tema: "Biologia marina", testo: "Il polpo cambia colore in un istante per mimetizzarsi. Se lo incontri, fermati: è lui a decidere se avvicinarsi." },
  { tema: "Biologia marina", testo: "Il cavalluccio marino è uno dei pochi animali in cui è il maschio a portare i piccoli." },
  { tema: "Biologia marina", testo: "I cavallucci si ancorano con la coda alle gorgonie e alla posidonia. Una pinneggiata troppo vicina li stacca." },
  { tema: "Biologia marina", testo: "Le stelle marine non hanno un cervello. Se perdono un braccio, spesso riescono a rigenerarlo." },
  { tema: "Biologia marina", testo: "I ricci hanno la bocca sotto, al centro. Si chiama lanterna di Aristotele." },
  { tema: "Biologia marina", testo: "Di notte, se sfiori certe acque, il plancton si accende. Si chiama bioluminescenza." },
  { tema: "Biologia marina", testo: "Il pesce luna può superare la tonnellata e si nutre soprattutto di meduse." },
  { tema: "Biologia marina", testo: "Le meduse non inseguono nessuno: vanno dove le porta la corrente. I tentacoli vanno guardati da lontano." },
  { tema: "Biologia marina", testo: "I nudibranchi sono lumache di mare senza conchiglia, spesso coloratissimi e lunghi pochi centimetri." },
  { tema: "Biologia marina", testo: "Le gorgonie sono colonie di piccoli animali, non piante. Un calcio di pinna le spezza e non ricrescono in una stagione." },
  { tema: "Biologia marina", testo: "Le spugne filtrano l'acqua tutto il giorno. Sembrano rocce, e invece sono vive." },
  { tema: "Biologia marina", testo: "I saraghi spesso si fanno pulire da piccoli gamberi. Quella sosta è una stazione di pulizia, non un litigio." },
  { tema: "Biologia marina", testo: "Molti labridi cambiano livrea tra femmina e maschio: lo stesso pesce, due colori." },
  { tema: "Biologia marina", testo: "Le oloturie, i cetrioli di mare, riciclano il sedimento. Sembrano ferme, ma lavorano per il fondo." },
  { tema: "Biologia marina", testo: "Le tracine si infossano nella sabbia. Meglio non posare mani o piedi sul fondo senza guardare." },
  { tema: "Biologia marina", testo: "Di notte molti pesci riposano negli anfratti. La torcia si tiene bassa e solo per un momento." },
  { tema: "Biologia marina", testo: "Il dattero di mare scava la roccia per vivere. Staccarlo è vietato: la tana nello scoglio resta per sempre." },
  { tema: "Biologia marina", testo: "Le tane sono case di qualcuno. Si guardano e si illuminano con rispetto, senza infilarci le mani." },
  { tema: "Biologia marina", testo: "Quasi tutti gli squali del Mediterraneo preferiscono stare alla larga dal sub. Incontrarne uno è un privilegio, non un allarme." },
];

const FISIOLOGIA: Nota[] = [
  { tema: "Fisiologia", testo: "Ogni 10 metri la pressione sale di 1 bar. A 10 metri il volume di un gas si dimezza: è la legge di Boyle." },
  { tema: "Fisiologia", testo: "In risalita il gas nei polmoni si espande. Trattenere il respiro può lesionare il polmone. Si espira, sempre." },
  { tema: "Fisiologia", testo: "Sotto pressione l'azoto si scioglie nel sangue. Se risali troppo in fretta, può formare bolle: è la malattia da decompressione." },
  { tema: "Fisiologia", testo: "Una sosta lenta in pochi metri dà tempo all'azoto di uscire dai tessuti con il respiro, non di restare nel sangue." },
  { tema: "Fisiologia", testo: "L'azoto, in profondità, può rallentare il ragionamento. Si chiama narcosi. Se la testa si fa strana, si risale un poco." },
  { tema: "Fisiologia", testo: "L'ossigeno che respiri aumenta con la profondità. Oltre un certo limite diventa tossico per il sistema nervoso." },
  { tema: "Fisiologia", testo: "Per questo una miscela ricca di ossigeno ha una profondità massima. Non è un consiglio: è un limite del corpo." },
  { tema: "Fisiologia", testo: "Lo stimolo a respirare arriva soprattutto dall'anidride carbonica, non dalla mancanza di ossigeno." },
  { tema: "Fisiologia", testo: "Se respiri poco e trattieni il fiato, l'anidride carbonica sale. Viene il fiatone e, in profondità, il gas è anche più denso." },
  { tema: "Fisiologia", testo: "Più scendi, più l'aria è densa e più fatica fanno i polmoni. Pinneggiare piano riduce quel lavoro." },
  { tema: "Fisiologia", testo: "Il freddo stringe i vasi e fa consumare più gas. Una muta giusta non è una comodità: è fisiologia." },
  { tema: "Fisiologia", testo: "L'acqua porta via il calore molto più in fretta dell'aria. Si ha freddo anche quando l'aria in barca sembrava mite." },
  { tema: "Fisiologia", testo: "Appena ci si immerge, il sangue si sposta verso il torace. I reni rispondono e viene da urinare: è la diuresi da immersione." },
  { tema: "Fisiologia", testo: "Perdere liquidi addensa il sangue e rende più faticosa l'eliminazione dell'azoto. Bere prima del tuffo conta." },
  { tema: "Fisiologia", testo: "L'orecchio medio è una cavità d'aria. Va equilibrata spesso, dal primo metro, prima che la pressione chiuda la tuba." },
  { tema: "Fisiologia", testo: "Anche i seni e la maschera sono spazi d'aria. Se non si equilibrano, la pressione li schiaccia." },
  { tema: "Fisiologia", testo: "In immersione il cuore rallenta un poco. È una risposta normale all'acqua sul viso, non un allarme." },
  { tema: "Fisiologia", testo: "Dopo il tuffo l'azoto esce ancora per ore. Volare o salire subito in montagna riduce la pressione e può far crescere le bolle." },
  { tema: "Fisiologia", testo: "Due immersioni nella stessa giornata lasciano azoto residuo. La seconda parte da un corpo che non è più a zero." },
  { tema: "Fisiologia", testo: "Uno sforzo forte sul fondo, o una risalita agitata, aumenta il rischio di bolle. La calma è una misura di sicurezza." },
  { tema: "Fisiologia", testo: "Il monossido di carbonio, se entra nella bombola, occupa il posto dell'ossigeno nel sangue. L'aria che sa di scarico non si respira." },
  { tema: "Fisiologia", testo: "Senza maschera la vista è sfocata: l'acqua toglie lo strato d'aria davanti all'occhio." },
  { tema: "Fisiologia", testo: "I colori spariscono con la profondità perché l'acqua assorbe prima il rosso. Non è l'occhio che si stanca: è la luce che manca." },
  { tema: "Fisiologia", testo: "Il suono arriva da tutte le parti: in acqua viaggia circa quattro volte più velocemente. Capire da dove viene è difficile." },
];

const PER_TEMA: Record<Tema, Nota[]> = {
  "In acqua": IN_ACQUA,
  "Biologia marina": BIOLOGIA,
  Fisiologia: FISIOLOGIA,
};

function seme(oggi: string): number {
  let n = 2166136261;
  for (const char of oggi) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0 || 1;
}

function prossimo(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function scegli(lista: Nota[], seed: number, quanti: number): { note: Nota[]; seed: number } {
  const note: Nota[] = [];
  const usati = new Set<number>();
  let giro = seed;
  while (note.length < quanti && usati.size < lista.length) {
    giro = prossimo(giro);
    const indice = giro % lista.length;
    if (usati.has(indice)) continue;
    usati.add(indice);
    note.push(lista[indice]);
  }
  return { note, seed: giro };
}

export function curiositaDelGiorno(oggi: string): Nota[] {
  let seed = seme(oggi);
  const pezzi: Nota[] = [];
  for (const tema of ["In acqua", "Biologia marina", "Fisiologia"] as const) {
    const quanti = tema === "Fisiologia" ? 1 : 2;
    const scelto = scegli(PER_TEMA[tema], seed, quanti);
    seed = scelto.seed;
    pezzi.push(...scelto.note);
  }
  const ordine = [...pezzi];
  for (let i = ordine.length - 1; i > 0; i -= 1) {
    seed = prossimo(seed);
    const j = seed % (i + 1);
    const tmp = ordine[i];
    ordine[i] = ordine[j];
    ordine[j] = tmp;
  }
  return ordine.slice(0, AL_GIORNO);
}

const CHIAVE = "smile-curiosita-viste";
const SPENTA = "tritone-popup-curiosita";
const AVVIO = "tritone-curiosita-avvio";

export function popupCuriositaAccesi(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(SPENTA) === "1";
  } catch {
    return false;
  }
}

export function impostaPopupCuriosita(accesi: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SPENTA, accesi ? "1" : "0");
}

export function curiositaDiAvvio(): boolean {
  if (!popupCuriositaAccesi()) return false;
  if (typeof sessionStorage === "undefined") return true;
  try {
    if (sessionStorage.getItem(AVVIO) === "1") return false;
    sessionStorage.setItem(AVVIO, "1");
    return true;
  } catch {
    return true;
  }
}

export function letteOggi(oggi: string): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(CHIAVE);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { day?: string; viste?: number };
    if (data.day !== oggi) return 0;
    const viste = Number(data.viste);
    return Number.isInteger(viste) && viste > 0 ? Math.min(viste, AL_GIORNO) : 0;
  } catch {
    return 0;
  }
}

export function salvaLette(oggi: string, viste: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHIAVE, JSON.stringify({ day: oggi, viste: Math.min(AL_GIORNO, Math.max(0, viste)) }));
}
