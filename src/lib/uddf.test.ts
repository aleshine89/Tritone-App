import assert from "node:assert/strict";
import test from "node:test";
import { chiaveQuando, leggiUddf, scriviUddf, type UddfRiga } from "./uddf.ts";

const FILE = `<?xml version="1.0" encoding="UTF-8"?>
<uddf version="3.2.0" xmlns="http://www.streit.cc/uddf/3.2/">
  <generator><name>OtherLog</name></generator>
  <divesite>
    <site id="s_arch">
      <name>Arco ${"&"}amp; Grotta</name>
      <geography>
        <location>Conero</location>
        <latitude>43.616</latitude>
        <longitude>13.566</longitude>
      </geography>
    </site>
    <site id="s_pool"><name>Piscina</name></site>
  </divesite>
  <gasdefinitions>
    <mix id="nx32"><name>EAN32</name><o2>0.32</o2><he>0</he></mix>
  </gasdefinitions>
  <profiledata>
    <repetitiongroup id="rg">
      <dive id="d1">
        <informationbeforedive>
          <link ref="nx32"/>
          <link ref="s_arch"/>
          <datetime>2024-06-01T09:30:00+02:00</datetime>
          <buddy><personal><firstname>Luca</firstname><lastname>Bianchi</lastname></personal></buddy>
        </informationbeforedive>
        <samples>
          <waypoint><depth>0</depth><divetime>0</divetime></waypoint>
          <waypoint><depth>18.4</depth><divetime>600</divetime></waypoint>
          <waypoint><depth>12</depth><divetime>2400</divetime></waypoint>
        </samples>
        <informationafterdive>
          <greatestdepth>30.2</greatestdepth>
          <diveduration>2520</diveduration>
          <lowesttemperature>291.15</lowesttemperature>
          <notes><para>Manta</para></notes>
        </informationafterdive>
      </dive>
      <dive id="d2">
        <informationbeforedive>
          <link ref="s_pool"/>
          <datetime>2024-06-01T09:30:00</datetime>
        </informationbeforedive>
        <informationafterdive>
          <greatestdepth>5</greatestdepth>
          <diveduration>40</diveduration>
        </informationafterdive>
      </dive>
      <dive id="d3">
        <informationbeforedive><datetime>not-a-date</datetime></informationbeforedive>
      </dive>
      <dive id="d4">
        <informationbeforedive>
          <datetime>2020-01-02</datetime>
          <name>Secca</name>
        </informationbeforedive>
        <samples>
          <waypoint><depth>10</depth><divetime>0</divetime></waypoint>
          <waypoint><depth>21</depth><divetime>1800</divetime></waypoint>
        </samples>
      </dive>
    </repetitiongroup>
  </profiledata>
</uddf>`;

test("legge data, sito, profondità, durata e profilo", () => {
  const esito = leggiUddf(FILE);
  assert.equal(esito.uddf, true);
  assert.equal(esito.senzaData, 1);
  assert.equal(esito.immersioni.length, 3);
  const prima = esito.immersioni[0];
  assert.equal(prima.data, "2024-06-01");
  assert.equal(prima.ora, "09:30");
  assert.equal(prima.localita, "Arco & Grotta");
  assert.equal(prima.punto, "Conero");
  assert.equal(prima.lat, "43.616");
  assert.equal(prima.lng, "13.566");
  assert.equal(prima.profondita, "30.2");
  assert.equal(prima.minuti, "42");
  assert.equal(prima.miscela, "Nitrox");
  assert.equal(prima.ossigeno, "32");
  assert.equal(prima.temperatura, "18");
  assert.equal(prima.note, "Manta");
  assert.equal(prima.buddy, "Luca Bianchi");
  assert.equal(prima.profilo.length, 3);
  assert.deepEqual(prima.profilo[1], { t: 600, d: 18.4 });
  assert.equal(esito.immersioni[1].localita, "Piscina");
  assert.equal(esito.immersioni[1].minuti, "1");
  assert.equal(chiaveQuando(prima.data, prima.ora), chiaveQuando(esito.immersioni[1].data, esito.immersioni[1].ora));
  const quarta = esito.immersioni[2];
  assert.equal(quarta.data, "2020-01-02");
  assert.equal(quarta.ora, "");
  assert.equal(quarta.localita, "Secca");
  assert.equal(quarta.profondita, "21");
  assert.equal(quarta.minuti, "30");
});

test("un testo qualsiasi non è un UDDF", () => {
  const esito = leggiUddf("questo non è un logbook");
  assert.equal(esito.uddf, false);
  assert.equal(esito.immersioni.length, 0);
});

test("esporta e rilegge senza i dati di altri", () => {
  const riga: UddfRiga = {
    data: "2024-06-01",
    ora: "09:30",
    localita: "Arco & Grotta",
    punto: "Conero",
    profondita: "30.2",
    minuti: "42",
    lat: "43.616",
    lng: "13.566",
    buddy: "Luca",
    miscela: "Nitrox",
    ossigeno: "32",
    temperatura: "18",
    note: "Manta",
    profilo: [
      { t: 0, d: 0 },
      { t: 600, d: 18.4 },
      { t: 2520, d: 5 },
    ],
  };
  const xml = scriviUddf([riga]);
  assert.equal(xml.includes("password"), false);
  assert.equal(xml.includes("brevetto"), false);
  const diNuovo = leggiUddf(xml).immersioni[0];
  assert.equal(diNuovo.data, riga.data);
  assert.equal(diNuovo.ora, riga.ora);
  assert.equal(diNuovo.localita, riga.localita);
  assert.equal(diNuovo.punto, riga.punto);
  assert.equal(diNuovo.profondita, riga.profondita);
  assert.equal(diNuovo.minuti, riga.minuti);
  assert.equal(diNuovo.miscela, "Nitrox");
  assert.equal(diNuovo.ossigeno, "32");
  assert.equal(diNuovo.temperatura, "18");
  assert.equal(diNuovo.note, "Manta");
  assert.equal(diNuovo.profilo.length, 3);
  assert.equal(diNuovo.profilo[2].t, 2520);
});
