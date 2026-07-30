# Wake Park Map

Carte interactive des téléskis nautiques et cable parks. **128 spots en France** pour ce
premier jet ; le reste de l'Europe est déjà préparé côté données mais pas encore intégré.

**→ [maelpena.github.io/wakepark-map](https://maelpena.github.io/wakepark-map/)**

## Ouvrir l'application

En ligne via le lien ci-dessus, ou en local : double-clique sur **`index.html`**. C'est tout
— pas de `npm install`, pas de serveur à lancer.

Une connexion internet est nécessaire : les fonds de carte et la bibliothèque Leaflet sont
chargés depuis le web. Les données des spots, elles, sont locales (`data/spots.js`).

## Ce que tu peux faire

- **Naviguer** sur la carte ; les marqueurs se regroupent au dézoom et s'ouvrent au clic.
- **Filtrer par type d'installation** : full-size (téléski 5-6 mâts, la grande boucle),
  System 2.0 (bi-poulie, deux tours, aller-retour), les deux, ou type indéterminé.
- **Chercher** par nom de spot ou par ville.
- **Cliquer un spot** (sur la carte ou dans la liste) pour ouvrir sa fiche : installation,
  contacts, liens, coordonnées GPS, itinéraire Google Maps.
- Chaque spot a une **URL partageable** : l'adresse se met à jour en `…/index.html#spot=fr-tnd-47`.

`Échap` ferme la fiche. Le filtre par pays apparaîtra quand il y aura plusieurs pays.

## Structure

```
index.html      page unique
app.js          carte, filtres, recherche, fiche détail
styles.css      thème sombre
data/spots.js   les données (window.SPOTS = [...])
tools/          scripts de collecte (voir plus bas)
docs/DESIGN.md  décisions techniques et pipeline de données
```

Les données sont dans un `.js` et non un `.json` : en `file://`, un navigateur bloque le
`fetch()` d'un fichier local (CORS), mais pas un `<script src>`. C'est ce qui permet
d'ouvrir l'app sans serveur.

## Les données

Trois sources croisées :

| Source | Ce qu'elle apporte |
|---|---|
| **OpenStreetMap** (Overpass API) | Positions GPS précises, site web, téléphone, horaires, adresse. Les téléskis nautiques y sont cartographiés en `aerialway=drag_lift` + `sport=water_ski`. |
| **tsn44.com**, **waketricks.com**, **likeepic.fr** | Le type de câble (full-size vs System 2.0), les liens Facebook, et les spots absents d'OSM. |
| **Nominatim** | Géocodage de secours pour les spots présents dans les annuaires mais pas dans OSM, et orthographe officielle des communes. |

Le champ `dataQuality` de chaque spot indique la confiance, et la fiche l'affiche en clair :

| Valeur | Nombre | Sens |
|---|---:|---|
| `verified` | 58 | Nom apparié entre un annuaire et OSM : position et type fiables. |
| `nearby` | 20 | Position issue de l'installation à câble relevée par OSM dans la commune. |
| `partial` | 17 | Une seule source, position non recoupée. |
| `approx` | 33 | **Position au centre de la commune**, pas sur le plan d'eau. Marqueur creux sur la carte. |

Un champ absent s'affiche « non renseigné ». Rien n'est inventé pour combler un trou.

### Limites connues

- **Tarifs et horaires** sont très incomplets : les annuaires ne les publient pas de façon
  structurée et ils changent chaque saison. À vérifier auprès du spot.
- Les 33 spots `approx` sont posés sur leur commune, pas sur le plan d'eau.
- Un parc fermé depuis la collecte peut encore figurer sur la carte.
- Les bases **bateau uniquement** ont été exclues du catalogue, mais quelques-unes
  reviennent via OSM quand OSM y voit un `aerialway` : elles apparaissent en
  « type indéterminé ».
- Le type reste `indéterminé` quand aucun annuaire ne couvrait le spot alors qu'OSM y voit
  bien une installation à câble. Ce sont souvent de petits spots que les annuaires ont
  manqués — donc à garder.

## Régénérer les données

`data/spots.js` est **généré**. Corriger un spot à la main dans ce fichier fonctionne, mais
la correction sera écrasée à la prochaine génération — pour un correctif durable, éditer
`tools/catalog.tsv`.

```bash
node tools/fetch_osm.mjs
```

```bash
node tools/build.mjs
```

`fetch_osm.mjs` interroge Overpass et écrit `tools/osm_fr.json`. `build.mjs` fusionne ce
fichier avec `tools/catalog.tsv` et réécrit `data/spots.js`.

Les deux scripts **sauvegardent au fur et à mesure** et reprennent où ils en étaient : les
réponses Overpass sont écrites après chaque requête, et chaque appel à Nominatim est mis en
cache dans `tools/geocache.json`. Une interruption ne coûte rien, il suffit de relancer.

### Étendre à l'Europe

Les deux scripts prennent la variable d'environnement `SCOPE` (codes pays ISO) :

```bash
SCOPE=FR,BE,CH,DE,IT,ES,NL node tools/fetch_osm.mjs && SCOPE=FR,BE,CH,DE,IT,ES,NL node tools/build.mjs
```

`tools/catalog.tsv` contient **déjà 510 entrées sur 29 pays** (relevées sur waketricks.com),
donc seule la collecte OSM reste à lancer. Compter une à deux minutes par pays sur Overpass.
La carte se recadre automatiquement sur les données présentes, et le filtre par pays
réapparaît de lui-même.

## Déployer une mise à jour

Le site est servi par GitHub Pages depuis la branche `main`, à la racine du dépôt. Un
`git push` suffit, le déploiement prend une minute ou deux.

Un détail à ne pas oublier : `index.html` référence ses assets avec un marqueur de version
(`app.js?v=2`). **Incrémenter ce numéro** — les trois occurrences — quand la mise à jour
touche `app.js`, `styles.css` ou `data/spots.js`. Sans ça, un visiteur déjà venu peut rester
sur les anciens fichiers pendant une dizaine de minutes, voire mélanger un HTML neuf avec un
JavaScript périmé.

## Crédits

Fonds de carte : © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
tuiles © [CARTO](https://carto.com/attributions). Cartographie : [Leaflet](https://leafletjs.com)
et [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster).
