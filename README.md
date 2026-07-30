# Wake Park Map

Carte interactive des téléskis nautiques et cable parks : **373 spots** en France et en
Europe proche (Allemagne, Royaume-Uni, Italie, Pays-Bas, Autriche, Espagne, Belgique, Suisse).

**→ [maelpena.github.io/wakepark-map](https://maelpena.github.io/wakepark-map/)**

## Ouvrir l'application

En ligne via le lien ci-dessus, ou en local : double-clique sur **`index.html`**. C'est tout
— pas de `npm install`, pas de serveur à lancer.

Une connexion internet est nécessaire : les fonds de carte et la bibliothèque Leaflet sont
chargés depuis le web. Les données des spots, elles, sont locales (`data/spots.js`).

## Ce que tu peux faire

- **Naviguer** sur la carte ; les marqueurs se regroupent au dézoom et s'ouvrent au clic.
- **Décocher « Regrouper les spots proches »** pour voir tous les points individuellement.
- **Filtrer par type d'installation** : full-size (téléski 5-6 mâts, la grande boucle),
  System 2.0 (bi-poulie, deux tours, aller-retour), ou type indéterminé.
- **Filtrer par pays** — la carte se recadre automatiquement sur le pays choisi.
- **Chercher** par nom de spot, ville ou pays (insensible aux accents : « barcares » trouve
  « Téléski du Barcarès »).
- **Cliquer un spot** pour ouvrir sa fiche : installation, contacts, liens, itinéraire.
- Chaque spot a une **URL partageable** : `…/#spot=fr-tnd-47`.

`Échap` ferme la fiche.

### Un plan d'eau avec un full-size *et* un bi-poulie compte comme full-size

C'est le grand téléski qui caractérise le spot. Le bi-poulie n'est pas perdu pour autant :
il reste mentionné dans le champ « Installation » de la fiche.

## Structure

```
index.html      page unique
app.js          carte, filtres, recherche, fiche détail
styles.css      thème clair
data/spots.js   les données générées (window.SPOTS = [...])
tools/          collecte et corrections (voir plus bas)
docs/DESIGN.md  décisions techniques et pipeline de données
```

Les données sont dans un `.js` et non un `.json` : en `file://`, un navigateur bloque le
`fetch()` d'un fichier local (CORS), mais pas un `<script src>`. C'est ce qui permet
d'ouvrir l'app sans serveur.

### Le fond de carte, et comment il devient sombre

Les fonds sombres tout faits (CARTO) affichent les libellés **en anglais** (« Germany »,
« Belgium »), et les tuiles OSM standard donnent les noms locaux (« Deutschland »,
« België / Belgique »). Seul **OpenStreetMap France** rend « Allemagne », « Pays-Bas »,
« Londres » — mais ses tuiles sont claires.

On les assombrit donc dans le navigateur, via un filtre CSS sur le calque de tuiles :
`invert` retourne la luminosité (fond clair → sombre, texte noir → blanc) et
`hue-rotate(180deg)` remet les teintes à l'endroit, sans quoi l'eau bleue virerait à
l'orange. Le filtre porte sur `.leaflet-tile-pane` et non sur chaque tuile : une seule
couche de composition, donc pas de coutures pendant le zoom.

Tout se règle sur une seule ligne, la variable `--tile-filter` en haut de `styles.css` :

```css
--tile-filter: invert(1) hue-rotate(180deg) brightness(0.78) contrast(1.12) saturate(0.45);
```

Plus sombre → baisser `brightness`. Plus coloré → monter `saturate`. Plus neutre → ajouter
du `grayscale`.

## Les données

| Source | Ce qu'elle apporte |
|---|---|
| **OpenStreetMap** (Overpass API) | Positions GPS précises, site web, téléphone, horaires. Les téléskis y sont cartographiés en `aerialway=drag_lift` + `sport=water_ski`. |
| **tsn44.com**, **waketricks.com**, **likeepic.fr** | Le type de câble, les liens Facebook, les spots absents d'OSM. |
| **Nominatim** | Géocodage de secours et orthographe officielle des communes. |
| **`tools/overrides.json`** | Vérifications et contacts relevés à la main sur les sites officiels et les réseaux sociaux. |

Le champ `dataQuality` indique la confiance, et la fiche l'affiche en clair :

| Valeur | Nombre | Sens |
|---|---:|---|
| `verified` | 131 | Nom apparié entre un annuaire et OSM : position et type fiables. |
| `nearby` | 76 | Position issue de l'installation à câble relevée par OSM dans la commune. |
| `partial` | 74 | Une seule source, position non recoupée. |
| `approx` | 92 | **Position au centre de la commune**, pas sur le plan d'eau. Marqueur creux. |

`dataQuality` décrit la **position**, pas la richesse de la fiche : connaître l'adresse
postale ne déplace pas le point. Un spot entièrement renseigné mais resté au centroïde de sa
commune garde donc `approx` et son marqueur creux. Seules des coordonnées explicites
(`"lat"` / `"lng"` dans `overrides.json`) le font passer en `verified`.

Un champ absent s'affiche « non renseigné ». Rien n'est inventé pour combler un trou.

### Ce qui a été retiré à la vérification

Huit entrées françaises ont été supprimées après contrôle des sites officiels :

- **Bases bateau, sans câble** : Dahu Wake Park, Planet Ski, Wake It Easy (lac de
  Monteynard), Wake & Gliss (Seine), GSNW / Ski Nautique Gazelec.
- **Spots fantômes** issus d'un listing de magazine : « Argelès » (renvoie au TSJ de
  Saint-Jean-Pla-de-Corts), « Béziers » (aucun téléski), « Hossegor » (renvoie à l'EXO 64
  du lac de Sames).

Un cas reste incertain et est signalé dans sa fiche : **Wakelagoona** (Virelade), dont le
site n'annonce plus que des sessions tractées bateau alors qu'un annuaire lui prête un
bi-poulie.

### Limites connues

- **Tarifs et horaires** ne sont renseignés que pour les spots vérifiés à la main (une
  cinquantaine en France). Ailleurs ils sont vides — ils changent chaque saison.
- Les 91 spots `approx` sont posés sur leur commune, pas sur le plan d'eau.
- **Hors de France, la vérification manuelle n'a pas encore été faite** : des bases bateau
  ou des spots fermés peuvent subsister dans les 253 spots européens.
- Deux domaines ont expiré et le lien a été retiré de la fiche (Wakepark Cable La
  Grande-Motte, Wood Wakepark 79) ; leur statut est à confirmer.

## Corriger un spot

**Ne pas éditer `data/spots.js`** : il est régénéré et la correction serait écrasée. Éditer
`tools/overrides.json`, qui est appliqué en fin de génération :

```json
{ "id": "fr-mon-spot", "phone": "06 12 34 56 78", "address": "…", "type": "system2" }
```

- `"action": "drop"` retire le spot de la carte (base bateau, spot fermé, doublon).
- La valeur `"-"` efface un champ — utile quand une source donne une information fausse,
  par exemple un domaine expiré racheté par un site sans rapport.
- `"lat"` et `"lng"` **corrigent la position** et font passer le spot en `verified`
  (marqueur plein). C'est le seul moyen de sortir un spot du statut « approché ».
- Champs acceptés : `name`, `type`, `lat`, `lng`, `address`, `phone`, `email`, `website`,
  `instagram`, `facebook`, `season`, `openingHours`, `prices`, `cables`, `city`, `notes`.

## Régénérer les données

```bash
SCOPE=FR,BE,NL,LU,DE,CH,AT,IT,ES,GB node tools/fetch_osm.mjs
```

```bash
SCOPE=FR,BE,NL,LU,DE,CH,AT,IT,ES,GB node tools/build.mjs
```

`fetch_osm.mjs` interroge Overpass et écrit `tools/osm_eu.json`. `build.mjs` fusionne OSM,
`tools/catalog.tsv` et `tools/overrides.json`, puis réécrit `data/spots.js`.

Les deux scripts **sauvegardent au fur et à mesure** et reprennent où ils en étaient : les
réponses Overpass sont écrites après chaque requête, chaque appel Nominatim est mis en cache
dans `tools/geocache.json`. Une interruption ne coûte rien, il suffit de relancer. Prévoir
une à deux minutes par pays — les serveurs Overpass renvoient souvent des 429 et 504, les
scripts réessaient sur un second endpoint.

`tools/catalog.tsv` contient **510 entrées sur 29 pays** : étendre à toute l'Europe ne
demande que d'ajouter les codes pays au `SCOPE`.

## Déployer une mise à jour

Le site est servi par GitHub Pages depuis `main`, à la racine. Un `git push` suffit.

⚠️ `index.html` référence ses assets avec un marqueur de version (`app.js?v=3`).
**Incrémenter ce numéro** — les trois occurrences — quand la mise à jour touche `app.js`,
`styles.css` ou `data/spots.js`. Sans ça, un visiteur déjà venu peut rester sur les anciens
fichiers, voire mélanger un HTML neuf avec un JavaScript périmé.

## Crédits

Fonds de carte : © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
tuiles [OpenStreetMap France](https://openstreetmap.fr/). Cartographie :
[Leaflet](https://leafletjs.com) et
[Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster).
