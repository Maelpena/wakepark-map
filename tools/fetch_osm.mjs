/* Collecte Overpass. Écrit en Node et non en PowerShell : Invoke-RestMethod (PS 5.1)
   décode les réponses HTTP en Latin-1 et corrompt tous les accents.
   Sauvegarde incrémentale après chaque requête, reprise depuis le disque. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'wakepark-map-research/1.0 (personal project)';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const SCOPE = (process.env.SCOPE || 'FR').split(',').map((c) => c.trim().toUpperCase());
const OUT = path.join(HERE, process.env.OSM_OUT || 'osm_fr.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const byId = new Map();
if (fs.existsSync(OUT)) {
  for (const e of JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^﻿/, ''))) byId.set(e.osm, e);
  console.log(`reprise : ${byId.size} éléments déjà en cache`);
}

const save = () => {
  fs.writeFileSync(OUT, JSON.stringify([...byId.values()], null, 1), 'utf8');
  console.log(`  → sauvegardé : ${byId.size} éléments`);
};

const QUERIES = {
  /* Le tag sport est indexé : requête rapide. */
  sport: (cc) => `[out:json][timeout:180];
area["ISO3166-1"="${cc}"][admin_level=2]->.a;
nwr["sport"~"water_ski|waterski|wakeboard|wake_board",i](area.a);
out center tags;`,

  /* Regex sur les noms : plus lente, mais rattrape les sites non tagués sport. */
  noms: (cc) => `[out:json][timeout:180];
area["ISO3166-1"="${cc}"][admin_level=2]->.a;
nwr["name"~"wakepark|wake park|wake-park|cablepark|cable park|teleski nautique|t.l.ski nautique|ski nautique|wakeboard|wasserski|kabelpark|kabelbaan",i](area.a);
out center tags;`,
};

async function run(cc, kind) {
  const body = new URLSearchParams({ data: QUERIES[kind](cc) });
  for (const ep of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(ep, { method: 'POST', body, headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();          // fetch décode l'UTF-8 correctement
        let added = 0;
        for (const e of json.elements) {
          const id = `${e.type}/${e.id}`;
          const lat = e.lat ?? e.center?.lat;
          const lon = e.lon ?? e.center?.lon;
          if (lat == null || lon == null || byId.has(id)) continue;
          byId.set(id, { country: cc, osm: id, lat, lon, tags: e.tags || {} });
          added++;
        }
        console.log(`${cc}/${kind} : ${json.elements.length} reçus, ${added} nouveaux`);
        save();
        return true;
      } catch (err) {
        console.log(`${cc}/${kind} : ${new URL(ep).host} essai ${attempt} KO — ${err.message}`);
        await sleep(12000);
      }
    }
  }
  console.log(`${cc}/${kind} : ÉCHEC sur tous les endpoints`);
  return false;
}

for (const cc of SCOPE) {
  for (const kind of ['sport', 'noms']) await run(cc, kind);
}

console.log(`TOTAL ${byId.size} éléments → ${OUT}`);
