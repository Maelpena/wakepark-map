/* Cherche le compte Instagram de chaque spot en lisant le HTML brut de son site.

   Passer par une extraction de texte perd les liens portés par les icônes de pied de page,
   qui sont justement là où vivent les réseaux sociaux. On lit donc le HTML tel quel et on y
   cherche les URL instagram.com — y compris dans les attributs et les scripts.

   Résultat écrit dans tools/instagram_found.json, à recopier dans overrides.json après
   relecture. Sauvegarde après chaque site : une interruption ne perd rien. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'instagram_found.json');
const UA = 'Mozilla/5.0 (compatible; wakepark-map/1.0; +https://maelpena.github.io/wakepark-map/)';

const spotsSrc = fs.readFileSync(path.join(HERE, '..', 'data', 'spots.js'), 'utf8');
const SPOTS = JSON.parse(spotsSrc.slice(spotsSrc.indexOf('['), spotsSrc.lastIndexOf(']') + 1));

/* Segments qui ne sont pas des comptes : pages internes d'Instagram et widgets de partage. */
const NON_COMPTES = new Set(['p', 'explore', 'reel', 'reels', 'stories', 'tv', 'accounts',
  'about', 'legal', 'developer', 'directory', 'instagram', 'share', 'privacy', 'terms',
  'graphql', 'oauth', 'embed', 'web']);

const cible = SPOTS.filter((s) => s.website && !s.instagram
  && !/facebook\.com/i.test(s.website));

console.log(`${cible.length} spots à sonder`);

const trouve = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(trouve, null, 1), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extraireComptes(html) {
  const comptes = new Set();
  const re = /instagram\.com\/(?:#!\/)?([A-Za-z0-9_.]{2,40})/gi;
  let m;
  while ((m = re.exec(html))) {
    const h = m[1].replace(/\.$/, '');
    if (!NON_COMPTES.has(h.toLowerCase())) comptes.add(h);
  }
  return [...comptes];
}

async function sonder(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!r.ok) return { erreur: `HTTP ${r.status}` };
    const html = await r.text();
    return { comptes: extraireComptes(html) };
  } catch (e) {
    return { erreur: e.name === 'AbortError' ? 'délai dépassé' : e.message };
  } finally {
    clearTimeout(t);
  }
}

let i = 0, hits = 0;
for (const s of cible) {
  i++;
  if (s.id in trouve) { if (trouve[s.id].comptes?.length) hits++; continue; }

  const res = await sonder(s.website);
  trouve[s.id] = { site: s.website, nom: s.name, ...res };
  if (res.comptes?.length) {
    hits++;
    console.log(`${String(i).padStart(3)}/${cible.length}  ${s.id}  →  ${res.comptes.join(', ')}`);
  } else if (i % 20 === 0) {
    console.log(`${String(i).padStart(3)}/${cible.length}  (${hits} trouvés)`);
  }
  save();
  await sleep(350);
}

console.log(`\nTerminé : ${hits} comptes Instagram trouvés sur ${cible.length} sites`);
console.log(`Détail dans ${OUT}`);
