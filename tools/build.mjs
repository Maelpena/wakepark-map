/* Fusionne les données OSM (coordonnées précises) avec le catalogue web (type de câble,
   liens) et produit data/spots.js. Géocodage Nominatim en secours, mis en cache. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(HERE, '..', 'data', 'spots.js');
const CACHE_FILE = path.join(HERE, 'geocache.json');
const UA = 'wakepark-map-research/1.0 (personal project)';

const cache = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8').replace(/^﻿/, '')) : {};

const COUNTRY_FULL = {
  FR: 'France', BE: 'Belgium', NL: 'Netherlands', LU: 'Luxembourg', DE: 'Germany',
  CH: 'Switzerland', AT: 'Austria', IT: 'Italy', ES: 'Spain', PT: 'Portugal',
  GB: 'United Kingdom', IE: 'Ireland', DK: 'Denmark', SE: 'Sweden', NO: 'Norway',
  FI: 'Finland', PL: 'Poland', CZ: 'Czechia', SK: 'Slovakia', HU: 'Hungary',
  SI: 'Slovenia', HR: 'Croatia', RS: 'Serbia', RO: 'Romania', BG: 'Bulgaria',
  GR: 'Greece', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania',
};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* PowerShell écrit un BOM UTF-8 en tête de ses fichiers ; JSON.parse le refuse. */
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const readJson = (p) => JSON.parse(readText(p));

/* ------------------------------------------------------------------ utils */

const norm = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Vocabulaire du milieu + toponymie française courante : ces mots ne distinguent rien.
   « saint » en particulier apparaît dans des dizaines de communes — s'y fier a apparié
   « TSN 44 Saint-Viaud » avec le téléski de Saint-Jean-Pla-de-Corts, à 800 km. */
const STOP = new Set(['wake', 'wakeboard', 'wakepark', 'park', 'parc', 'cable', 'cablepark',
  'teleski', 'nautique', 'nautisme', 'de', 'du', 'la', 'le', 'les', 'des', 'and', 'the',
  'wasserski', 'seilbahn', 'anlage', 'waterski', 'watersports', 'centrum', 'center', 'centre',
  'club', 'lake', 'see', 'base', 'loisirs', 'ski', 'sport', 'sports', 'lift',
  'saint', 'sainte', 'sur', 'sous', 'lac', 'plan', 'eau', 'aqua', 'grand', 'grande', 'petit',
  'petite', 'port', 'ile', 'val', 'mer', 'bois', 'pont', 'nouveau', 'stade', 'glisse']);

const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2));

/* Fréquence documentaire des tokens, calculée sur l'ensemble des noms à apparier :
   un token qui revient partout n'est pas un indice, même absent de STOP. */
const docFreq = new Map();
function indexNames(names) {
  for (const n of names) for (const t of tokens(n)) docFreq.set(t, (docFreq.get(t) || 0) + 1);
}
const isDistinctive = (t) => !STOP.has(t) && (docFreq.get(t) || 0) <= 2;

const sharedTokens = (a, b) => {
  const B = tokens(b);
  return [...tokens(a)].filter((t) => B.has(t));
};

/* Deux noms partagent-ils un token rare (nom propre du spot ou de sa commune) ? C'est le
   seul signal qui identifie un spot à lui seul. « WAM Park », « EXO », « Téléski
   nautique » sont partagés par des dizaines de bases : ils ne prouvent rien. */
const sharesDistinctive = (a, b) => sharedTokens(a, b).some(isDistinctive);

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const shared = sharedTokens(a, b);
  const jac = shared.length / (A.size + B.size - shared.length);
  return jac + (shared.some(isDistinctive) ? 0.35 : 0);
}

const R = 6371;
function distKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------- 1. lecture des données OSM */

/* Périmètre : codes pays ISO à inclure. 'FR' pour l'instant, l'Europe viendra après. */
const SCOPE = (process.env.SCOPE || 'FR').split(',').map((c) => c.trim().toUpperCase());
console.log(`Périmètre : ${SCOPE.join(', ')}`);

/* Sources Overpass, dédoublonnées par id OSM. Chaque fichier est optionnel. */
const byId = new Map();
for (const f of ['osm_fr.json', 'osm_eu.json', 'osm_by_country.json', 'osm_fast.json']) {
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) { console.log(`(${f} absent, ignoré)`); continue; }
  const arr = readJson(p);
  let kept = 0;
  arr.forEach((e) => {
    if (!SCOPE.includes(e.country) || byId.has(e.osm)) return;
    byId.set(e.osm, e);
    kept++;
  });
  console.log(`${f} : ${arr.length} éléments → ${kept} nouveaux dans le périmètre`);
}
const raw = [...byId.values()];

const CABLE_AERIALWAY = new Set(['drag_lift', 'rope_tow', 't-bar', 'station', 'pylon']);
const WAKE_RE = /wake|cable ?park|cablepark|kabelpark|kabelbaan|teleski|t.l.ski|wasserski|water ?ski|waterski|cable ?ski|vizisi|vandens|kabel/i;

/* Un élément compte comme installation à câble s'il porte un aerialway (c'est ainsi que
   sont cartographiés les téléskis nautiques) ou si son nom parle explicitement de wake. */
const isCable = (e) => {
  const t = e.tags || {};
  if (t.aerialway && CABLE_AERIALWAY.has(t.aerialway)) return true;
  if (/wakeboard/i.test(t.sport || '')) return true;
  return WAKE_RE.test(t.name || '') || WAKE_RE.test(t.operator || '');
};

const elements = raw
  .filter((e) => e.lat != null && e.lon != null && isCable(e))
  .map((e) => ({ ...e, lat: +e.lat, lon: +e.lon }));

console.log(`OSM : ${raw.length} éléments bruts → ${elements.length} retenus comme câble`);

/* ------------------------------------------- 2. regroupement en sites (clusters) */

const CLUSTER_KM = 0.6;
const clusters = [];

for (const e of elements) {
  let target = clusters.find((c) => c.country === e.country && distKm(c, e) < CLUSTER_KM
    && (!c.nameKey || !nameKeyOf(e) || c.nameKey === nameKeyOf(e) || distKm(c, e) < 0.25));
  if (!target) {
    target = { country: e.country, lat: e.lat, lon: e.lon, els: [], nameKey: nameKeyOf(e) };
    clusters.push(target);
  }
  target.els.push(e);
  // barycentre progressif
  target.lat = target.els.reduce((s, x) => s + x.lat, 0) / target.els.length;
  target.lon = target.els.reduce((s, x) => s + x.lon, 0) / target.els.length;
  if (!target.nameKey) target.nameKey = nameKeyOf(e);
}

function nameKeyOf(e) {
  const n = e.tags?.name;
  return n ? norm(n) : '';
}

/* Nom du site : on préfère le nom de l'enceinte (leisure/amenity) à celui du câble. */
const NAME_RANK = (t) => (t.leisure || t.amenity || t.tourism ? 0 : t.aerialway === 'station' ? 2 : t.aerialway ? 3 : 1);

for (const c of clusters) {
  const named = c.els.filter((e) => e.tags?.name)
    .sort((a, b) => NAME_RANK(a.tags) - NAME_RANK(b.tags) || b.tags.name.length - a.tags.name.length);
  const pick = (key) => c.els.map((e) => e.tags?.[key]).find(Boolean);

  c.name = named[0]?.tags.name || pick('operator') || null;
  c.website = pick('website') || pick('contact:website');
  c.phone = pick('phone') || pick('contact:phone');
  c.email = pick('email') || pick('contact:email');
  c.facebook = pick('contact:facebook') || pick('facebook');
  c.instagram = pick('contact:instagram') || pick('instagram');
  c.openingHours = pick('opening_hours');
  c.fee = pick('fee');
  c.city = pick('addr:city');
  c.description = pick('description');
  const street = pick('addr:street'), hn = pick('addr:housenumber'), pc = pick('addr:postcode');
  c.address = [hn && street ? `${hn} ${street}` : street, [pc, c.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ') || null;
  c.hasAerialway = c.els.some((e) => e.tags?.aerialway && CABLE_AERIALWAY.has(e.tags.aerialway));
  c.dragLifts = c.els.filter((e) => e.tags?.aerialway && ['drag_lift', 'rope_tow', 't-bar'].includes(e.tags.aerialway)).length;
}

const namedClusters = clusters.filter((c) => c.name);
console.log(`OSM : ${clusters.length} sites regroupés (${namedClusters.length} nommés)`);

/* ------------------------------------------------ 3. catalogue web (waketricks/tsn44) */

const tsv = readText(path.join(HERE, 'catalog.tsv')).trim().split(/\r?\n/);
const cols = tsv[0].split('\t');
const catalog = tsv.slice(1).map((line) => {
  const v = line.split('\t');
  return Object.fromEntries(cols.map((c, i) => [c, (v[i] || '').trim()]));
}).filter((c) => SCOPE.includes(c.country));

console.log(`Catalogue web : ${catalog.length} entrées dans le périmètre`);

/* --------------------------------------------------------- 4. appariement */

const SIM_MIN = 0.55;
const SAME_PLACE_KM = 15;
const used = new Set();

/* L'index de fréquence doit voir les deux corpus avant tout calcul de similarité. */
indexNames(namedClusters.map((c) => c.name));
indexNames(catalog.map((c) => `${c.name} ${c.city}`));

/* Position de la commune de chaque entrée : sert de garde-fou géographique. Sans elle,
   un nom de marque suffirait à apparier WAM Park 73 (Savoie) au site de Piolenc. */
console.log('Géocodage des communes du catalogue (garde-fou géographique)…');
for (const c of catalog) {
  if (!c.city) continue;
  c.cityPos = await geocodeCity(c.country, c.city);
}

/* Candidats (entrée, site OSM) puis affectation au meilleur score d'abord — et non dans
   l'ordre du fichier : une entrée au nom générique ne peut plus rafler le site d'une
   entrée qui, elle, correspond franchement. */
const pairs = [];
for (const c of catalog) {
  for (const cl of namedClusters) {
    if (cl.country !== c.country) continue;

    const sim = similarity(c.name, cl.name);
    if (!sim) continue;

    const sameCityName = c.city && cl.city && norm(c.city) === norm(cl.city);
    const nearCity = c.cityPos && distKm(c.cityPos, cl) < SAME_PLACE_KM;

    // Sans token rare partagé, il faut une preuve géographique que c'est bien ce site.
    if (!sharesDistinctive(c.name, cl.name) && !sameCityName && !nearCity) continue;

    const score = sim + (sameCityName ? 0.25 : 0) + (nearCity ? 0.2 : 0);
    if (score >= SIM_MIN) pairs.push({ c, cl, score });
  }
}

pairs.sort((a, b) => b.score - a.score);
for (const { c, cl } of pairs) {
  if (c.cluster || used.has(cl)) continue;
  c.cluster = cl;
  used.add(cl);
}

const matched = catalog.filter((c) => c.cluster).length;
console.log(`Appariés OSM ↔ catalogue : ${matched} / ${catalog.length}`);

/* -------------------------------------------------------- 5. géocodage manquant

   Les déclarations de fonction étant hoistées, l'étape 4 peut déjà appeler geocodeCity.
   Le cache est écrit sur disque après CHAQUE requête : une interruption ne perd rien, il
   suffit de relancer le script pour qu'il reprenne où il en était. */

async function nominatim(params, key) {
  if (key in cache) return cache[key];
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&' + params;
  await sleep(1150);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    cache[key] = j?.[0] ? { lat: +j[0].lat, lon: +j[0].lon, display: j[0].display_name } : null;
  } catch (err) {
    console.log(`  géocodage KO ${key}: ${err.message}`);
    cache[key] = null;
  }
  saveCache();
  return cache[key];
}

/* Déclaration de fonction (et non const) pour être hoistée : l'étape 4 l'appelle. */
function geocodeCity(country, city) {
  return nominatim(
    `city=${encodeURIComponent(city)}&countrycodes=${country.toLowerCase()}`,
    `c|${country}|${city}`);
}

const needGeo = catalog.filter((c) => !c.cluster);
console.log(`Géocodage Nominatim de ${needGeo.length} entrées sans correspondance OSM…`);

let geoDone = 0;
for (const c of needGeo) {
  if (++geoDone % 20 === 0) console.log(`  ${geoDone}/${needGeo.length}`);
  const country = COUNTRY_FULL[c.country] || c.country;
  const cc = `&countrycodes=${c.country.toLowerCase()}`;

  // 1) le nom du spot, qui peut exister dans OSM sous une forme que l'appariement a
  //    manquée ; 2) à défaut, la commune — position alors seulement approchée.
  let hit = await nominatim(
    `q=${encodeURIComponent(`${c.name}, ${c.city}, ${country}`)}${cc}`,
    `n|${c.country}|${c.name}|${c.city}`);

  // Un résultat par nom qui tombe loin de la commune annoncée est un homonyme : on refuse.
  if (hit && c.cityPos && distKm(hit, { lat: c.cityPos.lat, lon: c.cityPos.lon }) > 25) {
    console.log(`  écarté (homonyme à ${Math.round(distKm(hit, c.cityPos))} km) : ${c.name}`);
    hit = null;
  }
  if (!hit && c.cityPos) hit = { ...c.cityPos, approx: true };
  c.geo = hit;
}

const geocoded = needGeo.filter((c) => c.geo).length;
console.log(`Géocodés : ${geocoded} / ${needGeo.length}`);

/* --------------------------------------- 5b. appariement par proximité de commune

   Une entrée d'annuaire que le nom n'a pas su apparier, mais dont la commune tombe à
   moins de 12 km d'un site OSM à câble encore libre, désigne presque sûrement ce site :
   les téléskis nautiques sont rares, il n'y en a pas deux par bassin. On refuse de
   trancher quand plusieurs candidats sont à portée et qu'aucun nom ne concorde — mieux
   vaut une position approchée assumée qu'un faux appariement. */

const NEAR_KM = 12;
let nearMatched = 0;

for (const c of needGeo) {
  if (!c.geo) continue;
  const at = { lat: c.geo.lat, lon: c.geo.lon };
  const free = clusters
    .filter((cl) => cl.country === c.country && !used.has(cl) && distKm(at, cl) < NEAR_KM)
    .sort((a, b) => distKm(at, a) - distKm(at, b));

  let pick = null;
  if (free.length === 1) pick = free[0];
  else if (free.length > 1) {
    const byName = free.filter((cl) => cl.name && similarity(cl.name, c.name) > 0.3);
    if (byName.length === 1) pick = byName[0];
  }
  if (!pick) continue;

  c.cluster = pick;
  c.nearby = true;
  used.add(pick);
  nearMatched++;
}

console.log(`Appariés par proximité de commune : ${nearMatched}`);

/* ------------------------------------------------------------ 6. sortie finale */

const slugSeen = new Map();
function makeId(country, name) {
  let base = `${country.toLowerCase()}-${norm(name).replace(/ /g, '-')}`.slice(0, 60);
  const n = (slugSeen.get(base) || 0) + 1;
  slugSeen.set(base, n);
  return n > 1 ? `${base}-${n}` : base;
}

const fixUrl = (u) => {
  if (!u) return null;
  u = u.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^facebook\.com|^www\.facebook\.com/i.test(u)) return 'https://' + u;
  return 'https://' + u.replace(/^\/+/, '');
};

/* Certains noms OSM sont saisis avec des guillemets : Base nautique "Atlantic Wake Park". */
const cleanName = (n) => (n || '').replace(/["«»]/g, '').replace(/\s{2,}/g, ' ').trim();

/* Et certaines communes en capitales (addr:city = "SAMES"). */
const cleanCity = (c) => {
  if (!c || c.length < 4 || c !== c.toUpperCase()) return c;
  return c.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
};

const CABLE_TEXT = {
  fullsize: 'Téléski nautique full-size (5-6 mâts)',
  system2: 'Système 2 tours (System 2.0 / bi-poulie)',
  both: 'Téléski nautique full-size (5-6 mâts), plus un bi-poulie sur le site',
  unknown: null,
};

/* Un plan d'eau qui a un full-size ET un bi-poulie compte comme full-size : c'est le
   grand téléski qui caractérise le spot. Le bi-poulie reste mentionné dans le descriptif
   pour ne pas perdre l'information. */
const FILTER_TYPE = { fullsize: 'fullsize', both: 'fullsize', system2: 'system2' };

const spots = [];

for (const c of catalog) {
  const cl = c.cluster;
  const pos = cl ? { lat: cl.lat, lon: cl.lon } : c.geo;
  if (!pos) continue;

  const declared = ['fullsize', 'system2', 'both'].includes(c.type) ? c.type : 'unknown';
  const type = FILTER_TYPE[declared] || 'unknown';
  let cables = CABLE_TEXT[declared];
  if (cl?.dragLifts > 1 && declared !== 'system2') cables = `${cables} — ${cl.dragLifts} tracés relevés sur OSM`;

  spots.push({
    id: makeId(c.country, c.name),
    /* Quand le nom a permis l'appariement, on garde l'orthographe d'OSM : elle est
       accentuée et canonique, là où le catalogue est saisi en ASCII. Pour un appariement
       de proximité, on garde le nom du catalogue — celui d'OSM est souvent un générique
       du type « Téléski nautique ». */
    name: cleanName(!c.nearby && cl?.name && similarity(cl.name, c.name) > 0.45 ? cl.name : c.name),
    city: cl?.city || c.city || null,
    cityFromOsm: !!cl?.city,
    country: c.country,
    lat: +pos.lat.toFixed(6),
    lng: +pos.lon.toFixed(6),
    type,
    cables,
    website: fixUrl(c.website || cl?.website),
    facebook: fixUrl(c.facebook || cl?.facebook),
    instagram: fixUrl(cl?.instagram),
    phone: cl?.phone || null,
    email: cl?.email || null,
    address: cl?.address || null,
    openingHours: cl?.openingHours || null,
    season: null,   // renseignés à la main via overrides.tsv
    prices: null,
    notes: cl?.description || null,
    sources: [c.source, cl ? 'OpenStreetMap' : (pos.approx ? 'géocodage commune' : 'Nominatim')].filter(Boolean),
    dataQuality: cl ? (c.nearby ? 'nearby' : 'verified') : (pos.approx ? 'approx' : 'partial'),
  });
}

/* Sites OSM à câble absents du catalogue : on les ajoute (type indéterminé).

   Piège : un même parc peut se retrouver éclaté en deux sites OSM (les tracés de câble
   d'un côté, l'enceinte de loisirs de l'autre, sous des noms différents), dont un seul est
   apparié au catalogue. L'autre reviendrait alors en doublon, souvent sous un nom
   génerique (« Wake Park », « Téléski nautique »). Deux téléskis nautiques distincts à
   moins de 1,5 km l'un de l'autre étant à peu près inexistants, on considère qu'il s'agit
   du même spot : on verse les infos OSM dans la fiche déjà retenue plutôt que d'ajouter
   une seconde entrée. */
const MERGE_KM = 1.5;
let extras = 0, merged = 0;

for (const cl of clusters) {
  if (used.has(cl) || !cl.name) continue;
  if (!cl.hasAerialway && !WAKE_RE.test(cl.name)) continue;

  const twin = spots.find((s) => s.country === cl.country
    && distKm({ lat: s.lat, lon: s.lng }, cl) < MERGE_KM);
  if (twin) {
    twin.website ||= fixUrl(cl.website);
    twin.facebook ||= fixUrl(cl.facebook);
    twin.instagram ||= fixUrl(cl.instagram);
    twin.phone ||= cl.phone || null;
    twin.email ||= cl.email || null;
    twin.address ||= cl.address || null;
    twin.openingHours ||= cl.openingHours || null;
    twin.notes ||= cl.description || null;
    if (!twin.city && cl.city) { twin.city = cl.city; twin.cityFromOsm = true; }
    if (!twin.sources.includes('OpenStreetMap')) twin.sources.push('OpenStreetMap');
    merged++;
    continue;
  }

  spots.push({
    id: makeId(cl.country, cl.name),
    name: cleanName(cl.name),
    city: cl.city || null,
    cityFromOsm: !!cl.city,
    country: cl.country,
    lat: +cl.lat.toFixed(6),
    lng: +cl.lon.toFixed(6),
    type: 'unknown',
    cables: cl.dragLifts ? `${cl.dragLifts} tracé(s) de câble relevé(s) sur OSM` : null,
    website: fixUrl(cl.website),
    facebook: fixUrl(cl.facebook),
    instagram: fixUrl(cl.instagram),
    phone: cl.phone || null,
    email: cl.email || null,
    address: cl.address || null,
    openingHours: cl.openingHours || null,
    season: null,
    prices: null,
    notes: cl.description || null,
    sources: ['OpenStreetMap'],
    dataQuality: 'partial',
  });
  extras++;
}

console.log(`Sites OSM ajoutés hors catalogue : ${extras} (${merged} fusionnés dans une fiche existante)`);

/* ------------------------------------- 7. commune (géocodage inverse)

   Deux cas : les sites venus d'OSM seul n'ont souvent pas de tag addr:city, et les
   communes du catalogue sont saisies en ASCII (« Le Barcares »). Le géocodage inverse de
   la position finale donne l'orthographe officielle dans les deux cas. */

const noCity = spots.filter((s) => !s.cityFromOsm);
console.log(`Géocodage inverse de ${noCity.length} spots (commune absente ou non accentuée)…`);

for (const s of noCity) {
  const key = `r|${s.lat.toFixed(4)}|${s.lng.toFixed(4)}`;
  if (!(key in cache)) {
    await sleep(1150);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${s.lat}&lon=${s.lng}`,
        { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const a = j?.address || {};
      cache[key] = a.city || a.town || a.village || a.municipality || a.county || null;
    } catch (err) {
      console.log(`  inverse KO ${key}: ${err.message}`);
      cache[key] = null;
    }
    saveCache();
  }
  // On n'écrase la commune du catalogue que si le géocodage inverse en renvoie une.
  s.city = cache[key] || s.city;
}

console.log(`Communes retrouvées : ${noCity.filter((s) => s.city).length} / ${noCity.length}`);
spots.forEach((s) => { s.city = cleanCity(s.city); });

/* ------------------------------------------- 8. fusion par commune

   Le dédoublonnage géographique de l'étape 6 ne voit pas ces cas : une fiche d'annuaire
   posée au centre du village et le site OSM sur le plan d'eau peuvent être à 4 km. Une
   fois les communes connues, on rapproche fiche d'annuaire et site OSM d'une même commune.
   On adopte alors la position OSM, bien meilleure qu'un centroïde de commune.
   On ne touche pas à deux fiches d'annuaire d'une même commune : ce sont deux vrais spots. */

const isOsmOnly = (s) => s.sources.length === 1 && s.sources[0] === 'OpenStreetMap';
const cityKey = (s) => `${s.country}|${norm(s.city)}`;
const dropped = new Set();
let cityMerges = 0;

for (const osmOnly of spots.filter(isOsmOnly)) {
  if (dropped.has(osmOnly)) continue;
  const twin = spots.find((s) => s !== osmOnly && !dropped.has(s) && !isOsmOnly(s)
    && s.city && cityKey(s) === cityKey(osmOnly));
  if (!twin) continue;

  // La position OSM prime sur un centroïde de commune.
  if (twin.dataQuality === 'approx') {
    twin.lat = osmOnly.lat;
    twin.lng = osmOnly.lng;
    twin.dataQuality = 'nearby';
  }
  for (const k of ['website', 'facebook', 'instagram', 'phone', 'email', 'address',
    'openingHours', 'notes']) twin[k] ||= osmOnly[k];
  if (!twin.cables) twin.cables = osmOnly.cables;
  if (!twin.sources.includes('OpenStreetMap')) twin.sources.push('OpenStreetMap');

  console.log(`  fusion « ${osmOnly.name} » → « ${twin.name} » (${twin.city})`);
  dropped.add(osmOnly);
  cityMerges++;
}

if (cityMerges) {
  for (let i = spots.length - 1; i >= 0; i--) if (dropped.has(spots[i])) spots.splice(i, 1);
}
console.log(`Doublons fusionnés par commune : ${cityMerges}`);

spots.forEach((s) => { delete s.cityFromOsm; });

/* ------------------------------------------- 9. corrections manuelles

   overrides.json porte tout ce qu'aucune source automatique ne donne correctement :
   les spots fermés ou qui n'ont en réalité pas de câble (bases bateau), et les
   coordonnées de contact relevées à la main sur les sites et les réseaux sociaux.
   C'est ce fichier qu'il faut éditer pour corriger un spot — pas data/spots.js, qui est
   régénéré à chaque exécution. `"action": "drop"` retire le spot de la carte. */

const OV_FILE = path.join(HERE, 'overrides.json');
let ovApplied = 0, ovDropped = 0;
const ovUnknown = [];

if (fs.existsSync(OV_FILE)) {
  const byIdSpot = new Map(spots.map((s) => [s.id, s]));

  for (const o of readJson(OV_FILE)) {
    const s = byIdSpot.get(o.id);
    if (!s) { ovUnknown.push(o.id); continue; }

    if (o.action === 'drop') {
      s._drop = true;
      s._dropReason = o.notes || 'retiré manuellement';
      ovDropped++;
      continue;
    }
    /* Une valeur non vide écrase ce qui vient des sources automatiques. La valeur "-"
       efface le champ : nécessaire quand une source automatique donne une information
       carrément fausse — par exemple un nom de domaine expiré, racheté depuis par un
       site sans rapport, qu'il ne faut surtout pas continuer à proposer en lien. */
    for (const k of ['name', 'address', 'phone', 'email', 'website', 'instagram', 'facebook',
      'season', 'openingHours', 'prices', 'notes', 'cables', 'city']) {
      if (o[k] === '-') s[k] = null;
      else if (o[k]) s[k] = o[k];
    }
    if (o.type && FILTER_TYPE[o.type]) {
      s.type = FILTER_TYPE[o.type];
      s.cables = o.cables || CABLE_TEXT[o.type] || s.cables;
    }
    if (!s.sources.includes('vérifié à la main')) s.sources.push('vérifié à la main');

    /* dataQuality décrit la POSITION, pas la richesse de la fiche : connaître l'adresse
       postale ne déplace pas le point. Un spot resté au centroïde de sa commune garde donc
       `approx` et son marqueur creux, même entièrement renseigné par ailleurs.
       Seules des coordonnées explicites le font changer de catégorie. */
    if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) {
      s.lat = o.lat;
      s.lng = o.lng;
      s.dataQuality = 'verified';
    }
    ovApplied++;
  }

  for (let i = spots.length - 1; i >= 0; i--) {
    if (spots[i]._drop) {
      console.log(`  retiré : ${spots[i].name} (${spots[i]._dropReason})`);
      spots.splice(i, 1);
    }
  }
  console.log(`Corrections manuelles : ${ovApplied} fiches enrichies, ${ovDropped} retirées`);
  if (ovUnknown.length) console.log(`  ⚠ ids inconnus dans overrides.json : ${ovUnknown.join(', ')}`);
} else {
  console.log('(overrides.json absent, aucune correction manuelle)');
}

spots.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name, 'fr'));

const header = `/* Données générées le ${new Date().toISOString().slice(0, 10)}.
   Sources : OpenStreetMap (positions, contacts), annuaires wake (type de câble),
   tools/overrides.tsv (vérifications et contacts relevés à la main).
   ${spots.length} spots. Ne pas éditer à la main : régénérer via tools/build.mjs. */\n`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${header}window.SPOTS = ${JSON.stringify(spots, null, 1)};\n`, 'utf8');

const byCountry = {};
spots.forEach((s) => { byCountry[s.country] = (byCountry[s.country] || 0) + 1; });
console.log(`\n${spots.length} spots écrits dans ${OUT}`);
console.log(Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
const q = {};
spots.forEach((s) => { q[s.dataQuality] = (q[s.dataQuality] || 0) + 1; });
console.log('qualité :', q);
