# Design — Wake Park Map

Premier jet : une carte locale, ouvrable au double-clic, répertoriant les téléskis
nautiques et cable parks. Périmètre livré : **la France (128 spots)**. Le catalogue
d'annuaires couvre déjà 29 pays, seule la collecte OSM européenne reste à lancer.

## Décisions et pourquoi

**Zéro build, zéro serveur.** Leaflet + MarkerCluster via CDN, trois fichiers statiques.
La contrainte affichée était « le plus simple possible » : pas de Node, pas de `npm run dev`,
pas d'étape de compilation qui pourrait casser dans six mois.

**Données dans un `.js`, pas un `.json`.** En protocole `file://`, un navigateur refuse le
`fetch()` d'un fichier local (politique CORS sur les origines opaques) mais exécute sans
problème un `<script src="data/spots.js">`. C'est ce détail qui permet le double-clic. Un
`.json` aurait imposé de lancer un serveur HTTP.

**Fond de carte sombre (CARTO dark_all).** Les tuiles OSM standard sont claires et chargées
en détail ; sur un fond sombre les marqueurs colorés par type se lisent immédiatement, et
c'est le type d'installation qui est l'information principale.

**Regroupement des marqueurs.** ~100 spots en France tiennent dans un mouchoir de poche à
l'échelle européenne. Sans clustering, la carte est illisible au zoom initial.

**Marqueurs créés une fois.** Les objets `L.marker` sont construits au démarrage et
ajoutés/retirés du cluster au filtrage, plutôt que recréés. Le filtrage reste fluide.

## Modèle de donnée

```js
{ id, name, city, country,            // country = code ISO 2 lettres
  lat, lng,
  type: 'fullsize' | 'system2' | 'both' | 'unknown',
  cables,                             // description libre de l'installation
  website, facebook, instagram, phone, email, address, openingHours, notes,
  sources: [...],                     // d'où vient la fiche
  dataQuality: 'verified' | 'nearby' | 'partial' | 'approx' }
```

`type` pilote la couleur du marqueur et les filtres ; c'est le seul champ dont l'app dépend
vraiment. Tout le reste peut être `null` et s'affiche « non renseigné ».

La distinction qui structure la donnée est **full-size** (téléski 5-6 mâts, grande boucle,
plusieurs riders simultanés) vs **System 2.0** (bi-poulie, deux tours, aller-retour, un rider).
C'est la première question qu'on se pose sur un spot inconnu, donc c'est ce qui pilote la
couleur.

## Pipeline de données

```
Overpass API (par pays)  ──┐
                           ├─→ appariement par similarité de nom ──→ data/spots.js
annuaires web (TSV)      ──┘         puis géocodage de secours
```

1. **Overpass**, une requête par pays (`area["ISO3166-1"="FR"]`), en cherchant
   `sport~water_ski|wakeboard` et les noms contenant wake/cable/téléski/wasserski.
   Les téléskis nautiques sont cartographiés en `aerialway=drag_lift` + `sport=water_ski` —
   c'est le signal le plus fiable pour distinguer un câble d'une base bateau.
2. **Regroupement en sites** : un même parc apparaît en plusieurs éléments OSM (les tracés de
   câble, les stations, l'enceinte de loisirs). Clustering géographique à 600 m, avec garde-fou
   sur les noms pour ne pas fusionner deux parcs voisins. Le nom de l'enceinte
   (`leisure`/`amenity`) est préféré à celui du câble.
3. **Catalogue web** (`tools/catalog.tsv`) : nom, ville, pays, type de câble, liens, relevés
   sur tsn44.com et likeepic.fr (France) et waketricks.com (Europe). C'est la seule source
   du champ `type`.
4. **Appariement** catalogue ↔ sites OSM par similarité de tokens (Jaccard + bonus quand un
   token *rare* est partagé), avec deux garde-fous détaillés plus bas. L'affectation se fait
   au meilleur score d'abord, et non dans l'ordre du fichier. Apparié → position OSM + type
   du catalogue → `verified`.
5. **Appariement par proximité** : une entrée que le nom n'a pas su rattacher, mais dont la
   commune tombe à moins de 12 km d'un site OSM à câble encore libre, désigne ce site — il
   n'y a pas deux téléskis nautiques par bassin. Ambigu (plusieurs candidats, aucun nom qui
   concorde) → on ne tranche pas. → `nearby`.
6. **Géocodage de secours** (Nominatim, contraint au pays, 1 req/s, mis en cache) : le nom
   du spot, sinon la commune — ce dernier cas est marqué `approx`, le point tombant au
   centre du village.
7. **Sites OSM hors catalogue** ajoutés en `type: 'unknown'` s'ils portent un `aerialway` ou
   un nom explicite : OSM connaît des spots que les annuaires ont manqués.
8. **Dédoublonnage par commune**, après géocodage inverse : une fiche d'annuaire posée au
   centre du village et le site OSM sur le plan d'eau peuvent être à 4 km, donc invisibles
   pour un dédoublonnage purement géographique. À commune égale, on fusionne — et on adopte
   la position OSM, bien meilleure qu'un centroïde.

### Les deux pièges de l'appariement par nom

Ils ont produit de vraies erreurs avant d'être corrigés, et ils reviendront à l'ajout de
nouveaux pays :

**Les tokens fréquents.** Un bonus accordé à tout token « non générique » partagé a apparié
*TSN 44 Saint-Viaud* (Loire-Atlantique) au téléski de *Saint-Jean-Pla-de-Corts*
(Pyrénées-Orientales), à 800 km : le seul mot commun était « saint ». Corrigé en calculant
la fréquence documentaire de chaque token sur l'ensemble des noms — un token présent dans
plus de deux noms ne prouve rien, qu'il soit dans la liste de mots vides ou non.

**Les noms de marque.** *WAM Park*, *EXO*, *Téléski nautique* désignent des dizaines de
bases différentes. Le score de similarité seul plaçait *WAM Park 73* (Savoie) sur le site de
*Piolenc* (Vaucluse). Corrigé en exigeant, en l'absence de token rare partagé, une preuve
géographique : commune identique, ou site OSM à moins de 15 km de la commune géocodée.

Même logique côté géocodage : un résultat Nominatim trouvé par nom mais situé à plus de
25 km de la commune annoncée est un homonyme et se voit rejeté.

## Ce qui a été volontairement laissé de côté

- **Bases bateau uniquement** : hors sujet, la carte porte sur les installations à câble.
- **Tarifs et horaires** : pas publiés de façon structurée, changent chaque saison. Les
  quelques valeurs venant d'OSM sont conservées, le reste reste vide plutôt qu'inventé.
- **Obstacles (kickers, rails)** : aucune source structurée exploitable à cette échelle.
- **Photos** : impliquerait de rapatrier des médias sous droits.

## Pistes pour la suite

Détail des modules (nombre de mâts, longueur du câble), photos, avis, filtre
« ouvert aujourd'hui », export GPX, et un mode « spots autour de moi » via géolocalisation.
