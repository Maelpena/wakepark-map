/* Fusionne dans overrides.json les comptes Instagram retenus après relecture de
   instagram_found.json. La sélection est explicite plutôt que déduite par règles : le
   scan ramène du bruit qu'aucune heuristique simple ne distingue — artefacts de plateforme
   (wix, qodeinteractive), comptes personnels de riders, comptes d'un restaurant voisin, et
   surtout comptes d'une AUTRE base du même groupe (exo01_larena apparaît sur les pages de
   Tencin et du Muy, qui sont d'autres bases). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OV = path.join(HERE, 'overrides.json');

const RETENUS = {
  'at-pywakepark': 'pywakepark',
  'at-wakeboardlift-wien': 'wakeboardlift_wien',
  'at-wasserskischule-unterach': 'wasserschischule',
  'at-waver-wasserskischule': 'waverpoertschach',
  'be-dock-79': 'dock_79_park',
  'be-goodlife-cablepark': 'goodlifecablepark',
  'ch-alphasurf': 'alphasurf_',
  'ch-wasserski-club-basel': 'wasserskibasel',
  'de-agora-erlebnis-muldestausee': 'agora_erlebnis_resort',
  'de-beachclub-nethen': 'wake_beachclub_nethen',
  'de-wasserskianlage-toeppersee': 'sunwakepark_toeppersee',
  'de-chill-and-wake-friedberg': 'chillandwake',
  'de-dock5-wasserski-wakeboardpark-dueren': 'dock5dn',
  'de-wasserski-wakeboard-gufi-see': 'gufisee',
  'de-hooksieler-skiterrassen': 'skiterrassen',
  'de-magix-wake-freizeitpark-grossbeeren': 'magixwakeboarding',
  'de-wake-beach-de': 'wake_beach',
  'de-wakebeach-257': 'wakebeach257',
  'de-wakepark-wolfsburg': 'wakeparkwolfsburg',
  'de-wakepark-brombachsee': 'wakeparkbrombachsee',
  'de-wakepark-thulba': 'wakeparkthulba',
  'de-wasserski-wakeboard-park-suesel': 'suesel_seeparx',
  'de-wasserski-wakeboard-hamburg': 'wasserskiwakeboardhamburg',
  'de-wasserski-langenfeld': 'wasserski_langenfeld',
  'de-wasserski-paderborn': 'wasserski_paderborn',
  'de-wasserski-st-leon': 'wasserski_wakeboard_st.leon',
  'de-wasserski-und-wakeboard-zentrum-heuchelheim': 'southlake_heuchelheim',
  'de-wasserskilift-dresden': 'cable_dresden',
  'de-wasserski-und-wakeboard-park-jagel': 'wasserski_jagel',
  'de-wasserskiclub-kurpfalz': 'wsk.kurpfalz',
  'de-wasserskiclub-luzin-feldberg': 'wsc_luzin_feldberg',
  'de-wasserskipark-aschheim': 'wasserskipark_aschheim',
  'de-wasserskipark-damp': 'wakepark_damp',
  'de-wet-wild-cablepark-velten': 'wakepark_berlin_velten',
  'de-wildwakepark-steinberg-am-see': 'wildwakepark',
  'fr-awake-park': 'sylvain_awakepark',
  'fr-brumath-aventure-wakepark': 'funparcbrumath',
  'fr-poule-wake-park': 'poulewakepark',
  'fr-teleski-nautique-2': 'sgcvnautisme85',
  'fr-teleski-nautique-de-lery-poses': 'leryposes',
  'fr-tiki-wake-park': 'esprit_nature19',
  'fr-tna-cablepark': 'tna.cablepark',
  'fr-tsn-44-saint-viaud': 'tsnconcept',
  'fr-tsn-44-2-nozay': 'tsnconcept',
  'fr-wam-park-88': 'wampark_vosges',
  'fr-cablepark-avensan': 'wampark_avensan',
  'fr-exo-33-baurech': 'wampark_baurech',
  'fr-wam-park-69': 'wampark_lyoncondrieu',
  'gb-loch-earn-wakeschool': 'lochearnwakeschool',
  'gb-pier-52-watersports': 'pier52watersports',
  'gb-plastic-playground-wake-park': 'liquidleisurewakepark',
  'gb-quays-watersports': 'quays_watersports',
  'gb-wakeup-docklands': 'wakeupdocklands',
  'it-sunisland-wake-park': 'sunisland_wakepark',
  'it-wallygator-veronello-wakepark': 'gardawakewatersports',
  'nl-waterski-wakeboardcentrum-de-rooye-plas': 'derooyeplas',
  'nl-waterski-twente': 'waterskitwente',
  'nl-waterskibaan-ijzeren-man': 'zwembaddeijzerenman',
  'nl-wollebrand-cablepark': 'cableparkwollebrand',
};

/* Écartés volontairement, pour mémoire :
   - fr-exo-38-wakepark-tencin / fr-exo-83-le-muy → exo01_larena : compte d'une autre base.
   - fr-bzh-wakepark-bretagne / fr-paris-wakepark → la_source_wake_park : l'annuaire leur
     prête le site du parc de Carbonne, l'appartenance n'est pas établie.
   - fr-teleski-nautique-de-cany-barville → wix : artefact de l'éditeur du site. */

const overrides = JSON.parse(fs.readFileSync(OV, 'utf8').replace(/^﻿/, ''));
const parId = new Map(overrides.map((o) => [o.id, o]));

let ajoutes = 0, completes = 0;
for (const [id, handle] of Object.entries(RETENUS)) {
  const url = `https://www.instagram.com/${handle}/`;
  const existant = parId.get(id);
  if (existant) {
    if (existant.instagram) continue;
    existant.instagram = url;
    completes++;
  } else {
    const o = { id, instagram: url };
    overrides.push(o);
    parId.set(id, o);
    ajoutes++;
  }
}

fs.writeFileSync(OV, `${JSON.stringify(overrides, null, 1)}\n`, 'utf8');
console.log(`${ajoutes} nouvelles entrées, ${completes} entrées complétées → ${overrides.length} corrections au total`);
