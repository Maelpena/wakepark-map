/* Wake Park Map — carte des téléskis nautiques / cable parks d'Europe.
   Aucune dépendance de build : Leaflet + MarkerCluster via CDN, données dans data/spots.js. */

const TYPE_LABEL = {
  fullsize: 'Full-size (téléski 5-6 mâts)',
  system2: 'System 2.0 (bi-poulie / 2 tours)',
  both: 'Full-size + System 2.0',
  unknown: 'Type non déterminé',
};

const COUNTRY_NAME = {
  FR: 'France', BE: 'Belgique', NL: 'Pays-Bas', LU: 'Luxembourg', DE: 'Allemagne',
  CH: 'Suisse', AT: 'Autriche', IT: 'Italie', ES: 'Espagne', PT: 'Portugal',
  GB: 'Royaume-Uni', IE: 'Irlande', DK: 'Danemark', SE: 'Suède', NO: 'Norvège',
  FI: 'Finlande', PL: 'Pologne', CZ: 'Tchéquie', SK: 'Slovaquie', HU: 'Hongrie',
  SI: 'Slovénie', HR: 'Croatie', RS: 'Serbie', RO: 'Roumanie', BG: 'Bulgarie',
  GR: 'Grèce', EE: 'Estonie', LV: 'Lettonie', LT: 'Lituanie', BA: 'Bosnie-Herzégovine',
  UA: 'Ukraine', TR: 'Turquie', CY: 'Chypre', MT: 'Malte', IS: 'Islande',
  ME: 'Monténégro', MK: 'Macédoine du Nord', AL: 'Albanie', MD: 'Moldavie', BY: 'Biélorussie',
};

const spots = (window.SPOTS || []).slice();
const state = {
  query: '',
  country: '',
  types: new Set(['fullsize', 'system2', 'both', 'unknown']),
  selected: null,
};

const el = {
  search: document.getElementById('search'),
  country: document.getElementById('country'),
  typeFilters: document.getElementById('type-filters'),
  count: document.getElementById('count'),
  countLabel: document.getElementById('count-label'),
  results: document.getElementById('results'),
  detail: document.getElementById('detail'),
  detailBody: document.getElementById('detail-body'),
  detailClose: document.getElementById('detail-close'),
  totalNote: document.getElementById('total-note'),
};

/* ---------------------------------------------------------------- carte */

const map = L.map('map', { center: [46.6, 2.4], zoom: 6, zoomControl: true, worldCopyJump: true });

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

const cluster = L.markerClusterGroup({
  maxClusterRadius: 45,
  showCoverageOnHover: false,
  spiderfyDistanceMultiplier: 1.4,
  iconCreateFunction(c) {
    const n = c.getChildCount();
    const size = n < 10 ? 32 : n < 50 ? 38 : 46;
    return L.divIcon({
      html: `<div class="cluster" style="width:${size}px;height:${size}px">${n}</div>`,
      className: '',
      iconSize: [size, size],
    });
  },
}).addTo(map);

/* Un marqueur par spot, créé une fois puis ajouté/retiré du cluster selon les filtres. */
spots.forEach((s) => {
  // Position approchée (centre de la commune) : marqueur creux, pour ne pas laisser croire
  // que le point est sur le plan d'eau.
  const cls = `pin p-${s.type}${s.dataQuality === 'approx' ? ' approx' : ''}`;
  s.marker = L.marker([s.lat, s.lng], {
    icon: L.divIcon({ html: `<div class="${cls}"></div>`, className: '', iconSize: [15, 15] }),
    title: s.name,
  }).on('click', () => select(s, false));
});

/* ------------------------------------------------------------- filtrage */

const norm = (v) => (v || '')
  .toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '');

function matches(s) {
  if (!state.types.has(s.type)) return false;
  if (state.country && s.country !== state.country) return false;
  if (!state.query) return true;
  const q = norm(state.query);
  return [s.name, s.city, s.region, COUNTRY_NAME[s.country], s.cables]
    .some((f) => norm(f).includes(q));
}

function render() {
  const visible = spots.filter(matches);

  cluster.clearLayers();
  cluster.addLayers(visible.map((s) => s.marker));

  el.count.textContent = visible.length;
  el.countLabel.textContent = visible.length === 1 ? 'spot affiché' : 'spots affichés';

  renderResults(visible);
}

function renderResults(visible) {
  if (!visible.length) {
    el.results.innerHTML = '<p class="empty">Aucun spot ne correspond à ces critères.</p>';
    return;
  }

  const sorted = visible.slice().sort((a, b) => {
    const ca = COUNTRY_NAME[a.country] || a.country;
    const cb = COUNTRY_NAME[b.country] || b.country;
    return ca.localeCompare(cb, 'fr') || a.name.localeCompare(b.name, 'fr');
  });

  const frag = document.createDocumentFragment();
  sorted.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'result';
    row.innerHTML = `<i class="dot t-${s.type}"></i>
      <span><span class="result-name">${escapeHtml(s.name)}</span><br>
      <span class="result-sub">${escapeHtml([s.city, COUNTRY_NAME[s.country] || s.country].filter(Boolean).join(' · '))}</span></span>`;
    row.onclick = () => select(s, true);
    frag.appendChild(row);
  });

  el.results.replaceChildren(frag);
}

/* --------------------------------------------------------------- détail */

function select(s, fly, animate = true) {
  if (state.selected && state.selected.marker._icon) {
    state.selected.marker._icon.querySelector('.pin')?.classList.remove('selected');
  }
  state.selected = s;

  /* On déplace la carte nous-mêmes plutôt que via cluster.zoomToShowLayer() : ce dernier
     ne bouge pas la carte et n'appelle jamais son callback ici. Zoomer suffit de toute
     façon à sortir le marqueur de son cluster (rayon de 45 px).
     Pas d'animation pour un lien profond : au chargement la carte n'a pas encore sa taille
     définitive et l'animation se perdait, laissant la vue sur le cadrage par défaut. */
  const highlight = () => s.marker._icon?.querySelector('.pin')?.classList.add('selected');

  if (fly) {
    const zoom = Math.max(map.getZoom(), 13);
    map.once('moveend', highlight);
    if (animate) map.flyTo([s.lat, s.lng], zoom, { duration: 0.7 });
    else map.setView([s.lat, s.lng], zoom, { animate: false });
  }

  highlight(); // si le marqueur est déjà affiché seul

  showDetail(s);
  setHash(`#spot=${encodeURIComponent(s.id)}`);
}

/* L'app est faite pour être ouverte en file:// : certains navigateurs y refusent
   replaceState. Une URL non mise à jour est un détail, une exception qui interrompt la
   sélection du spot n'en est pas un. */
function setHash(hash) {
  try {
    history.replaceState(null, '', hash || location.href.split('#')[0]);
  } catch {
    if (hash) location.hash = hash;
  }
}

function row(label, value, isHtml) {
  const empty = value === undefined || value === null || value === '' ||
    (Array.isArray(value) && !value.length);
  const body = empty
    ? '<dd class="na">non renseigné</dd>'
    : `<dd>${isHtml ? value : escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</dd>`;
  return `<div class="d-row"><dt>${label}</dt>${body}</div>`;
}

function showDetail(s) {
  const place = [s.city, s.region, COUNTRY_NAME[s.country] || s.country].filter(Boolean).join(' · ');

  const links = [];
  if (s.website) links.push(`<a href="${attr(s.website)}" target="_blank" rel="noopener">Site web</a>`);
  if (s.instagram) links.push(`<a href="${attr(s.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  if (s.facebook) links.push(`<a href="${attr(s.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
  links.push(`<a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" target="_blank" rel="noopener">Itinéraire</a>`);
  links.push(`<a href="https://www.google.com/search?q=${encodeURIComponent(s.name + ' wakepark ' + (s.city || ''))}" target="_blank" rel="noopener">Rechercher</a>`);

  const services = [
    s.school === true ? 'école / cours' : null,
    s.rental === true ? 'location de matériel' : null,
  ].filter(Boolean);

  el.detailBody.innerHTML = `
    <h2>${escapeHtml(s.name)}</h2>
    <p class="d-place">${escapeHtml(place)}</p>
    <span class="badge b-${s.type}">${escapeHtml(TYPE_LABEL[s.type])}</span>
    <dl>
      ${row('Installation', s.cables)}
      ${row('Obstacles', s.obstacles)}
      ${row('Services', services)}
      ${row('Saison', s.season)}
      ${row('Horaires', s.openingHours)}
      ${row('Tarifs', s.prices)}
      ${row('Adresse', s.address)}
      ${row('Téléphone', s.phone ? `<a href="tel:${attr(s.phone.replace(/\s/g, ''))}">${escapeHtml(s.phone)}</a>` : '', true)}
      ${row('E-mail', s.email ? `<a href="mailto:${attr(s.email)}">${escapeHtml(s.email)}</a>` : '', true)}
      ${row('Coordonnées', `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`)}
      ${s.notes ? row('Notes', s.notes) : ''}
    </dl>
    <div class="d-links">${links.join('')}</div>
    <p class="d-quality">${escapeHtml(qualityNote(s))}</p>`;

  el.detail.classList.remove('hidden');
  el.detail.scrollTop = 0;
}

function qualityNote(s) {
  const src = (s.sources || []).join(', ') || 'inconnue';
  const q = {
    verified: 'Position et type d\'installation confirmés par deux sources.',
    nearby: 'Position issue de l\'installation à câble relevée sur OpenStreetMap dans cette commune.',
    approx: '⚠ Position approchée : le point est au centre de la commune, pas sur le plan d\'eau.',
    partial: 'Fiche incomplète : une seule source, position non recoupée.',
  }[s.dataQuality] || 'Fiche incomplète.';
  return `${q} Sources : ${src}. Tarifs et horaires peuvent être obsolètes — vérifier auprès du spot.`;
}

el.detailClose.onclick = () => {
  el.detail.classList.add('hidden');
  if (state.selected?.marker._icon) {
    state.selected.marker._icon.querySelector('.pin')?.classList.remove('selected');
  }
  state.selected = null;
  setHash('');
};

/* ------------------------------------------------------------ contrôles */

el.search.addEventListener('input', (e) => { state.query = e.target.value; render(); });

el.country.addEventListener('change', (e) => {
  state.country = e.target.value;
  render();
  if (state.country) {
    const pts = spots.filter((s) => s.country === state.country).map((s) => [s.lat, s.lng]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
});

el.typeFilters.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  const t = btn.dataset.type;
  if (state.types.has(t)) state.types.delete(t);
  else state.types.add(t);
  btn.classList.toggle('active', state.types.has(t));
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.detail.classList.contains('hidden')) el.detailClose.click();
});

/* ------------------------------------------------------------ démarrage */

function escapeHtml(v) {
  return (v ?? '').toString().replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const attr = escapeHtml;

function buildCountrySelect() {
  const counts = {};
  spots.forEach((s) => { counts[s.country] = (counts[s.country] || 0) + 1; });

  // Un seul pays dans les données : le filtre n'a rien à filtrer.
  if (Object.keys(counts).length < 2) el.country.closest('.field').hidden = true;

  Object.keys(counts)
    .sort((a, b) => (COUNTRY_NAME[a] || a).localeCompare(COUNTRY_NAME[b] || b, 'fr'))
    .forEach((c) => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = `${COUNTRY_NAME[c] || c} (${counts[c]})`;
      el.country.appendChild(o);
    });
  el.totalNote.textContent = `${spots.length} spots dans ${Object.keys(counts).length} pays.`;
}

buildCountrySelect();
render();

/* Cadrage initial sur les données présentes : aujourd'hui la France, demain l'Europe,
   sans avoir à retoucher le centre et le zoom à la main.
   On cadre sur le 1er-99e centile et non sur les extrêmes, sinon un seul spot lointain
   (la Martinique) suffit à dézoomer la carte sur l'Atlantique. Les points écartés du
   cadrage restent bien sûr sur la carte et dans la liste. */
function coreBounds(list) {
  const at = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const lats = list.map((s) => s.lat).sort((a, b) => a - b);
  const lngs = list.map((s) => s.lng).sort((a, b) => a - b);
  return L.latLngBounds(
    [at(lats, 0.01), at(lngs, 0.01)],
    [at(lats, 0.99), at(lngs, 0.99)],
  );
}

const hash = /^#spot=(.+)$/.exec(location.hash);
const target = hash && spots.find((x) => x.id === decodeURIComponent(hash[1]));

if (target) {
  map.whenReady(() => select(target, true, false));
} else if (spots.length) {
  /* Si la carte est mesurée avant d'avoir sa taille définitive (panneau encore masqué,
     fenêtre redimensionnée juste après l'ouverture), le zoom calculé est faux. On recadre
     à chaque redimensionnement, tant que l'utilisateur n'a pas pris la main lui-même. */
  let touched = false;
  let framing = false;

  /* animate: false — sinon, quand le zoom calculé égale le zoom courant, fitBounds passe
     par un panoramique animé au résultat peu fiable au chargement. */
  const frame = () => {
    framing = true;
    map.fitBounds(coreBounds(spots).pad(0.08), { animate: false });
    framing = false;
  };

  map.on('zoomstart movestart', () => { if (!framing) touched = true; });
  map.on('resize', () => { if (!touched) frame(); });
  frame();
}
