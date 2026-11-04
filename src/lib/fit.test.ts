import assert from "node:assert/strict";
import test from "node:test";
import { leggiFit, leggiLogbook } from "./fit.ts";

const START = Date.UTC(2024, 5, 15, 9, 30, 0) / 1000 - Date.UTC(1989, 11, 31) / 1000;

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

function i32(n: number): number[] {
  return u32(n | 0);
}

function str(text: string, size: number): number[] {
  const out = new Array<number>(size).fill(0);
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < Math.min(bytes.length, size - 1); i += 1) out[i] = bytes[i];
  return out;
}

function semi(deg: number): number {
  return Math.round((deg * 2147483648) / 180);
}

function definition(local: number, global: number, fields: [number, number, number][], devs: [number, number, number][] = []): number[] {
  const bytes = [(devs.length ? 0x60 : 0x40) | local, 0, 0, global & 0xff, (global >> 8) & 0xff, fields.length];
  for (const field of fields) bytes.push(field[0], field[1], field[2]);
  if (devs.length) {
    bytes.push(devs.length);
    for (const field of devs) bytes.push(field[0], field[1], field[2]);
  }
  return bytes;
}

function file(records: number[]): Uint8Array {
  const body = Uint8Array.from(records);
  const header = new Uint8Array(12);
  header[0] = 12;
  header[1] = 0x20;
  header[4] = body.length & 0xff;
  header[5] = (body.length >> 8) & 0xff;
  header[6] = (body.length >> 16) & 0xff;
  header[7] = (body.length >>> 24) & 0xff;
  header.set([0x2e, 0x46, 0x49, 0x54], 8);
  const out = new Uint8Array(header.length + body.length);
  out.set(header);
  out.set(body, header.length);
  return out;
}

test("un .fit tiene le immersioni e scarta corsa e le altre attività", () => {
  const fit = file([
    ...definition(0, 34, [[253, 4, 0x86], [5, 4, 0x86]]),
    ...[0, ...u32(START), ...u32(START + 7200)],
    ...definition(1, 12, [[0, 1, 0x00], [3, 20, 0x07]]),
    ...[1, 53, ...str("Secca del Faro", 20)],
    ...definition(2, 18, [[254, 2, 0x84], [2, 4, 0x86], [253, 4, 0x86], [5, 1, 0x00], [6, 1, 0x00], [8, 4, 0x86], [3, 4, 0x85], [4, 4, 0x85], [57, 1, 0x01]]),
    ...[2, ...u16(0), ...u32(START), ...u32(START + 42 * 60), 53, 53, ...u32(42 * 60 * 1000), ...i32(semi(43.5)), ...i32(semi(13.5)), 18],
    ...definition(3, 20, [[253, 4, 0x86], [92, 4, 0x86]]),
    ...[3, ...u32(START + 30), ...u32(5000)],
    ...[3, ...u32(START + 120), ...u32(18500)],
    ...[3, ...u32(START + 600), ...u32(3000)],
    ...definition(4, 268, [[0, 2, 0x84], [1, 2, 0x84], [3, 4, 0x86]]),
    ...[4, ...u16(18), ...u16(0), ...u32(18500)],
    ...definition(5, 259, [[0, 1, 0x02], [1, 1, 0x02], [2, 1, 0x00]]),
    ...[5, 0, 32, 1],
    ...[2, ...u16(1), ...u32(START + 86400), ...u32(START + 86400 + 1800), 1, 0, ...u32(30 * 60 * 1000), ...i32(0x7fffffff), ...i32(0x7fffffff), 0x7f],
    ...[3, ...u32(START + 86400 + 60), ...u32(30000)],
    ...[1, 53, ...str("Diving", 20)],
    ...definition(6, 206, [[0, 1, 0x02], [1, 1, 0x02], [2, 1, 0x02], [3, 16, 0x07], [6, 1, 0x02], [8, 8, 0x07]]),
    ...[6, 0, 0, 132, ...str("depth", 16), 100, ...str("m", 8)],
    ...definition(7, 20, [[253, 4, 0x86]], [[0, 2, 0]]),
    ...[2, ...u16(2), ...u32(START + 2 * 86400), ...u32(START + 2 * 86400 + 20 * 60), 53, 56, ...u32(20 * 60 * 1000), ...i32(0x7fffffff), ...i32(0x7fffffff), 0x7f],
    ...[7, ...u32(START + 2 * 86400 + 60), ...u16(1000)],
  ]);

  const esito = leggiFit(fit);
  assert.equal(esito.uddf, true);
  assert.equal(esito.immersioni.length, 2);
  const [prima, seconda] = esito.immersioni;
  assert.equal(prima.data, "2024-06-15");
  assert.equal(prima.ora, "11:30");
  assert.equal(prima.localita, "Secca del Faro");
  assert.equal(prima.profondita, "18.5");
  assert.equal(prima.minuti, "42");
  assert.equal(prima.miscela, "Nitrox");
  assert.equal(prima.ossigeno, "32");
  assert.equal(prima.temperatura, "18");
  assert.ok(Math.abs(Number(prima.lat) - 43.5) < 0.0001);
  assert.ok(Math.abs(Number(prima.lng) - 13.5) < 0.0001);
  assert.deepEqual(prima.profilo.map((punto) => punto.d), [5, 18.5, 3]);
  assert.equal(seconda.data, "2024-06-17");
  assert.equal(seconda.ora, "11:30");
  assert.equal(seconda.localita, "Sito non indicato");
  assert.equal(seconda.profondita, "10");
  assert.equal(seconda.minuti, "20");
  assert.equal(seconda.profilo.length, 1);
  assert.equal(seconda.profilo[0]?.t, 60);
  assert.ok(!esito.immersioni.some((riga) => riga.profondita === "30" || riga.minuti === "30"));
});

test("il profilo con timestamp compresso resta allineato", () => {
  const t0 = START + 30;
  const t1 = t0 + 5;
  const header = 0x80 | (t1 & 0x1f);
  const fit = file([
    ...definition(1, 18, [[2, 4, 0x86], [253, 4, 0x86], [5, 1, 0x00], [8, 4, 0x86]]),
    ...[1, ...u32(START), ...u32(START + 10 * 60), 53, ...u32(10 * 60 * 1000)],
    ...definition(0, 20, [[253, 4, 0x86], [92, 4, 0x86]]),
    ...[0, ...u32(t0), ...u32(5000)],
    ...[header, ...u32(8000)],
  ]);
  const esito = leggiFit(fit);
  assert.equal(esito.immersioni.length, 1);
  assert.deepEqual(esito.immersioni[0]?.profilo, [
    { t: 30, d: 5 },
    { t: 35, d: 8 },
  ]);
});

test("un .fit di sola corsa non ha immersioni", () => {
  const fit = file([
    ...definition(0, 18, [[2, 4, 0x86], [5, 1, 0x00], [8, 4, 0x86]]),
    ...[0, ...u32(START), 1, ...u32(30 * 60 * 1000)],
  ]);
  const esito = leggiLogbook(fit);
  assert.equal(esito.uddf, true);
  assert.equal(esito.immersioni.length, 0);
});

test("un file che non è né FIT né UDDF non si legge", () => {
  assert.equal(leggiLogbook(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).uddf, false);
});

test("un UDDF passa ancora dal lettore comune", () => {
  const xml = `<uddf><dive><datetime>2024-01-02T08:15:00</datetime><informationafterdive><greatestdepth>12</greatestdepth><diveduration>1800</diveduration></informationafterdive></dive></uddf>`;
  const esito = leggiLogbook(new TextEncoder().encode(xml));
  assert.equal(esito.uddf, true);
  assert.equal(esito.immersioni.length, 1);
  assert.equal(esito.immersioni[0]?.data, "2024-01-02");
  assert.equal(esito.immersioni[0]?.ora, "08:15");
  assert.equal(esito.immersioni[0]?.profondita, "12");
  assert.equal(esito.immersioni[0]?.minuti, "30");
});
