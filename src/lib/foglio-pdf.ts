const MAPPA: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": "\"",
  "”": "\"",
  "–": "-",
  "—": "-",
  " ": " ",
  "€": "EUR",
};

function pdfTesto(value: string): string {
  let out = "";
  for (const ch of value) {
    const mapped = MAPPA[ch] ?? ch;
    const code = mapped.codePointAt(0) ?? 63;
    if (mapped === "\\") out += "\\\\";
    else if (mapped === "(") out += "\\(";
    else if (mapped === ")") out += "\\)";
    else if (code >= 32 && code <= 126) out += mapped;
    else if (code >= 160 && code <= 255) out += "\\" + code.toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

function spezza(value: string, max: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > max) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += max) lines.push(word.slice(i, i + max));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function assembla(streams: string[], landscape = false): Uint8Array {
  const font1 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const font2 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const body: { id: number; src: string }[] = [
    { id: 3, src: font1 },
    { id: 4, src: font2 },
  ];
  const pageIds: number[] = [];
  let next = 5;
  for (const stream of streams) {
    const contentId = next++;
    const pageId = next++;
    pageIds.push(pageId);
    body.push({
      id: contentId,
      src: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
    body.push({
      id: pageId,
      src: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${landscape ? "842 595" : "595 842"}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    });
  }
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  body.unshift({ id: 2, src: `<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>` });
  body.unshift({ id: 1, src: "<< /Type /Catalog /Pages 2 0 R >>" });
  body.sort((a, b) => a.id - b.id);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of body) {
    offsets[obj.id] = out.length;
    out += `${obj.id} 0 obj\n${obj.src}\nendobj\n`;
  }
  const xrefPos = out.length;
  const count = body.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(out + xref);
}

export function scriviPdfFoglio(input: {
  titolo: string;
  data: string;
  uscita: string;
  colonne: [string, string, string];
  righe: { nome: string; brevetto: string; profondita: string }[];
}): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function chiudiPagina() {
    pages.push(ops.join("\n"));
    ops = [];
    y = 800;
  }

  function spazio(altezza: number) {
    if (y - altezza < 48) chiudiPagina();
  }

  testo(40, 16, "F2", input.titolo);
  y -= 24;
  testo(40, 12, "F1", input.data);
  y -= 18;
  for (const line of spezza(input.uscita, 88)) {
    testo(40, 12, "F1", line);
    y -= 16;
  }
  y -= 8;
  ops.push("0.6 w", `40 ${y} m 555 ${y} l S`);
  y -= 18;
  testo(40, 10, "F2", input.colonne[0]);
  testo(190, 10, "F2", input.colonne[1]);
  testo(410, 10, "F2", input.colonne[2]);
  y -= 6;
  ops.push(`40 ${y} m 555 ${y} l S`);
  y -= 16;

  for (const row of input.righe) {
    const nome = spezza(row.nome, 26);
    const brevetto = spezza(row.brevetto, 38);
    const profondita = spezza(row.profondita, 24);
    const n = Math.max(nome.length, brevetto.length, profondita.length, 1);
    spazio(n * 14 + 6);
    for (let i = 0; i < n; i++) {
      if (nome[i]) testo(40, 10, "F1", nome[i]);
      if (brevetto[i]) testo(190, 10, "F1", brevetto[i]);
      if (profondita[i]) testo(410, 10, "F1", profondita[i]);
      y -= 14;
    }
    y -= 4;
  }
  chiudiPagina();
  return assembla(pages.filter((page) => page.trim()));
}

export function scriviPdfElenco(input: {
  titolo: string;
  periodo: string;
  colonne: [string, string, string, string];
  righe: { data: string; barca: string; localita: string; persone: string }[];
  vuoto: string;
}): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function chiudiPagina() {
    pages.push(ops.join("\n"));
    ops = [];
    y = 800;
  }

  function spazio(altezza: number) {
    if (y - altezza < 48) chiudiPagina();
  }

  testo(40, 16, "F2", input.titolo);
  y -= 22;
  testo(40, 11, "F1", input.periodo);
  y -= 16;
  ops.push("0.6 w", `40 ${y} m 555 ${y} l S`);
  y -= 16;
  testo(40, 10, "F2", input.colonne[0]);
  testo(130, 10, "F2", input.colonne[1]);
  testo(280, 10, "F2", input.colonne[2]);
  testo(480, 10, "F2", input.colonne[3]);
  y -= 6;
  ops.push(`40 ${y} m 555 ${y} l S`);
  y -= 16;

  if (!input.righe.length) {
    testo(40, 11, "F1", input.vuoto);
    chiudiPagina();
    return assembla(pages.filter((page) => page.trim()));
  }

  for (const row of input.righe) {
    const data = spezza(row.data, 16);
    const barca = spezza(row.barca, 22);
    const localita = spezza(row.localita, 32);
    const persone = spezza(row.persone, 8);
    const n = Math.max(data.length, barca.length, localita.length, persone.length, 1);
    spazio(n * 14 + 4);
    for (let i = 0; i < n; i++) {
      if (data[i]) testo(40, 10, "F1", data[i]);
      if (barca[i]) testo(130, 10, "F1", barca[i]);
      if (localita[i]) testo(280, 10, "F1", localita[i]);
      if (persone[i]) testo(480, 10, "F1", persone[i]);
      y -= 14;
    }
  }
  chiudiPagina();
  return assembla(pages.filter((page) => page.trim()));
}

export function scriviPdfBlocchi(input: { titolo: string; nota: string; blocchi: string[][]; vuoto: string }): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function chiudiPagina() {
    pages.push(ops.join("\n"));
    ops = [];
    y = 800;
  }

  function spazio(altezza: number) {
    if (y - altezza < 48) chiudiPagina();
  }

  testo(40, 16, "F2", input.titolo);
  y -= 18;
  for (const riga of spezza(input.nota, 90)) {
    testo(40, 9, "F1", riga);
    y -= 12;
  }
  y -= 8;

  if (!input.blocchi.length) {
    testo(40, 11, "F1", input.vuoto);
    chiudiPagina();
    return assembla(pages.filter((page) => page.trim()));
  }

  for (const blocco of input.blocchi) {
    const righe = blocco.flatMap((riga) => spezza(riga, 95));
    spazio(righe.length * 13 + 10);
    for (const [index, riga] of righe.entries()) {
      testo(40, 10, index === 0 ? "F2" : "F1", riga);
      y -= 13;
    }
    y -= 8;
  }
  chiudiPagina();
  return assembla(pages.filter((page) => page.trim()));
}

export function scriviPdfPiano(input: {
  titolo: string;
  sottotitolo: string;
  info: string[];
  colonne: string[];
  righe: string[][];
  avvisi: string[];
  segmenti: { da: number; depth: number; runtime: number; minutes: number; sosta: boolean; cambio: boolean }[];
  nota: string;
}): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `0 0 0 rg`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function chiudiPagina() {
    pages.push(ops.join("\n"));
    ops = [];
    y = 800;
  }

  function spazio(altezza: number) {
    if (y - altezza < 48) chiudiPagina();
  }

  testo(40, 16, "F2", input.titolo);
  y -= 16;
  for (const riga of spezza(input.sottotitolo, 90)) {
    testo(40, 10, "F1", riga);
    y -= 13;
  }
  y -= 4;
  for (const riga of input.info) {
    spazio(14);
    testo(40, 10, "F1", riga);
    y -= 13;
  }

  const segmenti = input.segmenti.filter((row) => Number.isFinite(row.runtime) && Number.isFinite(row.depth));
  if (segmenti.length) {
    spazio(190);
    const x0 = 48;
    const y0 = y - 168;
    const w = 500;
    const h = 150;
    const maxT = Math.max(1, ...segmenti.map((row) => row.runtime));
    const maxD = Math.max(6, ...segmenti.map((row) => Math.max(row.da, row.depth)));
    const px = (t: number) => x0 + (t / maxT) * w;
    const py = (d: number) => y0 + h - (d / maxD) * h;
    ops.push("0.75 0.82 0.8 RG", "0.6 w", `${x0} ${y0} m`, `${x0 + w} ${y0} l`, `${x0} ${y0} m`, `${x0} ${y0 + h} l`, "S");
    ops.push("0.12 0.45 0.42 RG", "1.4 w");
    ops.push(`${px(0)} ${py(0)} m`);
    for (const row of segmenti) {
      const t0 = Math.max(0, row.runtime - row.minutes);
      ops.push(`${px(t0)} ${py(row.da)} l`, `${px(row.runtime)} ${py(row.depth)} l`);
    }
    ops.push("S");
    ops.push("0.78 0.55 0.16 RG", "0.9 w");
    for (const row of segmenti) {
      if (!row.sosta && !row.cambio) continue;
      const cx = px(row.runtime);
      const cy = py(row.depth);
      ops.push(`${cx - 3} ${cy} m`, `${cx + 3} ${cy} l`, `${cx} ${cy - 3} m`, `${cx} ${cy + 3} l`, "S");
    }
    ops.push("0 0 0 RG", "0.6 w");
    y = y0 - 16;
    testo(40, 8, "F1", "Profilo: linea quota/tempo. I segni marcano soste e cambi gas.");
    y -= 14;
  }

  spazio(28);
  const col = [40, 150, 230, 300, 420];
  testo(col[0], 9, "F2", input.colonne[0] ?? "");
  testo(col[1], 9, "F2", input.colonne[1] ?? "");
  testo(col[2], 9, "F2", input.colonne[2] ?? "");
  testo(col[3], 9, "F2", input.colonne[3] ?? "");
  testo(col[4], 9, "F2", input.colonne[4] ?? "");
  y -= 14;
  for (const riga of input.righe) {
    spazio(13);
    for (let i = 0; i < 5; i++) testo(col[i], 9, "F1", riga[i] ?? "");
    y -= 12;
  }
  y -= 6;
  for (const avviso of input.avvisi) {
    for (const riga of spezza(avviso, 95)) {
      spazio(13);
      testo(40, 9, "F1", riga);
      y -= 12;
    }
  }
  y -= 6;
  for (const riga of spezza(input.nota, 95)) {
    spazio(12);
    testo(40, 8, "F1", riga);
    y -= 11;
  }
  chiudiPagina();
  return assembla(pages.filter((page) => page.trim()));
}

const LARGHEZZE_SUB = [124, 150, 96, 64, 118, 122, 104];
const LARGHEZZE_STAFF = [210, 90, 146, 166, 166];

export function scriviPdfReport(input: {
  titolo: string;
  centro: string;
  periodo: string;
  generato: string;
  vuoto: string;
  senzaSub: string;
  guida: string;
  colonneSub: string[];
  colonneStaff: string[];
  immersioni: { titolo: string; guide: { nome: string; righe: string[][] }[] }[];
  staffTitolo: string;
  staffVuoto: string;
  staff: string[][];
}): Uint8Array {
  const sinistra = 32;
  const destra = 810;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 560;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function chiudiPagina() {
    pages.push(ops.join("\n"));
    ops = [];
    y = 560;
  }

  function spazio(altezza: number): boolean {
    if (y - altezza >= 36) return false;
    chiudiPagina();
    testo(sinistra, 9, "F1", `${input.titolo}  ·  ${input.centro}`);
    y -= 16;
    return true;
  }

  function fascia(altezza: number, grigio: string) {
    const top = y + 9;
    ops.push(`${grigio} rg`, `${sinistra} ${top - altezza} ${destra - sinistra} ${altezza} re f`, "0 0 0 rg");
  }

  function rigaTabella(celle: string[], larghezze: number[], bold: boolean, intestazione?: string[]) {
    const maxCaratteri = larghezze.map((larghezza) => Math.max(6, Math.floor(larghezza / 4.3)));
    const linee = celle.map((cella, index) => spezza(cella || "—", maxCaratteri[index] ?? 8));
    const altezza = Math.max(...linee.map((lineeCella) => lineeCella.length), 1) * 11 + 7;
    if (spazio(altezza) && intestazione) rigaTabella(intestazione, larghezze, true);
    fascia(altezza, bold ? "0.85 0.9 0.9" : "1 1 1");
    let x = sinistra + 3;
    const base = y;
    for (let index = 0; index < celle.length; index += 1) {
      y = base;
      for (const linea of linee[index] ?? ["—"]) {
        testo(x, 8, bold ? "F2" : "F1", linea);
        y -= 11;
      }
      x += larghezze[index] ?? 0;
    }
    y = base - altezza + 5;
    ops.push("0.3 w", "0.65 0.7 0.74 RG", `${sinistra} ${y} m ${destra} ${y} l S`, "0 0 0 RG");
    y -= 3;
  }

  testo(sinistra, 18, "F2", input.titolo);
  y -= 24;
  testo(sinistra, 12, "F2", input.centro);
  y -= 16;
  testo(sinistra, 10, "F1", input.periodo);
  y -= 14;
  testo(sinistra, 10, "F1", input.generato);
  y -= 8;
  ops.push("1.2 w", `${sinistra} ${y} m ${destra} ${y} l S`);
  y -= 18;

  if (!input.immersioni.length) {
    testo(sinistra, 11, "F1", input.vuoto);
    y -= 22;
  }

  for (const immersione of input.immersioni) {
    spazio(56);
    testo(sinistra, 12, "F2", immersione.titolo);
    y -= 6;
    ops.push("0.9 w", "0.12 0.42 0.46 RG", `${sinistra} ${y} m ${destra} ${y} l S`, "0 0 0 RG");
    y -= 16;
    const guide = immersione.guide.length ? immersione.guide : [{ nome: "—", righe: [] }];
    for (const gruppo of guide) {
      spazio(40);
      testo(sinistra, 10, "F2", `${input.guida}: ${gruppo.nome || "—"}`);
      y -= 14;
      rigaTabella(input.colonneSub, LARGHEZZE_SUB, true);
      if (!gruppo.righe.length) rigaTabella([input.senzaSub, "", "", "", "", "", ""], LARGHEZZE_SUB, false, input.colonneSub);
      for (const riga of gruppo.righe) rigaTabella(riga.slice(0, 7), LARGHEZZE_SUB, false, input.colonneSub);
      y -= 8;
    }
    y -= 10;
  }

  spazio(52);
  testo(sinistra, 13, "F2", input.staffTitolo);
  y -= 6;
  ops.push("0.9 w", "0.12 0.42 0.46 RG", `${sinistra} ${y} m ${destra} ${y} l S`, "0 0 0 RG");
  y -= 16;
  rigaTabella(input.colonneStaff, LARGHEZZE_STAFF, true);
  if (!input.staff.length) rigaTabella([input.staffVuoto, "", "", "", ""], LARGHEZZE_STAFF, false, input.colonneStaff);
  for (const riga of input.staff) rigaTabella(riga.slice(0, 5), LARGHEZZE_STAFF, false, input.colonneStaff);

  chiudiPagina();
  return assembla(pages.filter((page) => page.trim()), true);
}

export type PezzoModulo =
  | { k: "sezione"; t: string }
  | { k: "nota"; t: string }
  | { k: "campo"; t: string }
  | { k: "coppia"; a: string; b: string }
  | { k: "scelta"; t: string; opzioni: string[] }
  | { k: "sino"; t: string }
  | { k: "spunta"; t: string }
  | { k: "firma"; t: string };

export function scriviPdfModulo(input: { kicker: string; titolo: string; piede: string; pezzi: PezzoModulo[] }): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;
  let pagina = 1;

  function testo(x: number, size: number, font: "F1" | "F2", value: string) {
    ops.push("BT", `/${font} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${pdfTesto(value)}) Tj`, "ET");
  }

  function linea(x1: number, x2: number, yy: number) {
    ops.push("0.4 w", `${x1} ${yy} m ${x2} ${yy} l S`);
  }

  function casella(x: number, yy: number) {
    ops.push("0.6 w", `${x} ${yy} 8 8 re S`);
  }

  function chiudi() {
    const salvo = y;
    y = 36;
    testo(520, 8, "F1", String(pagina));
    y = salvo;
    pages.push(ops.join("\n"));
    ops = [];
  }

  function intestazione() {
    y = 800;
    testo(40, 8, "F1", `${input.kicker} | ${input.titolo} (continua)`);
    y -= 11;
    linea(40, 555, y);
    y -= 16;
  }

  function serve(altezza: number) {
    if (y - altezza >= 52) return;
    chiudi();
    pagina += 1;
    intestazione();
  }

  testo(40, 8, "F1", input.kicker);
  y -= 18;
  for (const riga of spezza(input.titolo, 42)) {
    testo(40, 16, "F2", riga);
    y -= 20;
  }
  y -= 2;
  linea(40, 555, y);
  y -= 16;

  for (const pezzo of input.pezzi) {
    if (pezzo.k === "sezione") {
      serve(26);
      y -= 6;
      testo(40, 12, "F2", pezzo.t);
      y -= 6;
      linea(40, 555, y);
      y -= 14;
      continue;
    }
    if (pezzo.k === "nota") {
      const righe = spezza(pezzo.t, 92);
      serve(righe.length * 12 + 6);
      for (const riga of righe) {
        testo(40, 9, "F1", riga);
        y -= 12;
      }
      y -= 6;
      continue;
    }
    if (pezzo.k === "campo") {
      serve(28);
      testo(40, 8, "F1", pezzo.t);
      y -= 14;
      linea(40, 555, y);
      y -= 12;
      continue;
    }
    if (pezzo.k === "coppia") {
      serve(28);
      testo(40, 8, "F1", pezzo.a);
      testo(310, 8, "F1", pezzo.b);
      y -= 14;
      linea(40, 280, y);
      linea(310, 555, y);
      y -= 12;
      continue;
    }
    if (pezzo.k === "scelta") {
      const voci = pezzo.opzioni.map((voce) => `[ ] ${voce}`);
      const righe: string[] = [];
      let corrente = "";
      for (const voce of voci) {
        const prossima = corrente ? `${corrente}   ${voce}` : voce;
        if (prossima.length > 78 && corrente) {
          righe.push(corrente);
          corrente = voce;
        } else corrente = prossima;
      }
      if (corrente) righe.push(corrente);
      const titolo = spezza(pezzo.t, 90);
      serve(titolo.length * 12 + righe.length * 13 + 6);
      for (const riga of titolo) {
        testo(40, 9, "F2", riga);
        y -= 12;
      }
      for (const riga of righe) {
        testo(40, 9, "F1", riga);
        y -= 13;
      }
      y -= 4;
      continue;
    }
    if (pezzo.k === "sino") {
      const righe = spezza(pezzo.t, 90);
      serve(righe.length * 12 + 18);
      for (const riga of righe) {
        testo(40, 9, "F1", riga);
        y -= 12;
      }
      casella(40, y - 2);
      testo(52, 9, "F1", "Sì");
      casella(100, y - 2);
      testo(112, 9, "F1", "No");
      y -= 16;
      continue;
    }
    if (pezzo.k === "spunta") {
      const righe = spezza(pezzo.t, 86);
      serve(righe.length * 12 + 6);
      casella(40, y - 2);
      for (const riga of righe) {
        testo(54, 9, "F1", riga);
        y -= 12;
      }
      y -= 4;
      continue;
    }
    serve(46);
    testo(40, 8, "F1", pezzo.t);
    y -= 26;
    linea(40, 360, y);
    linea(400, 555, y);
    y -= 11;
    testo(40, 8, "F1", "Firma");
    testo(400, 8, "F1", "Data");
    y -= 16;
  }

  const piede = spezza(input.piede, 100);
  serve(piede.length * 10 + 8);
  y -= 4;
  for (const riga of piede) {
    testo(40, 8, "F1", riga);
    y -= 10;
  }
  chiudi();
  return assembla(pages.filter((page) => page.trim()));
}
