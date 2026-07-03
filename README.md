# Covoiturage Map React

Application interactive permettant de visualiser les trajets de covoiturage en France, basée sur les données ouvertes du Registre de Preuve de Covoiturage (RPC).

## Fonctionnalités

- Carte interactive des trajets de covoiturage (clusters en vue large, trajets individuels en zoom élevé)
- **Chargement progressif en streaming** : le CSV mensuel (300-400 Mo) est parsé au fil du téléchargement et interrompu après `MAX_TRIPS` lignes — la carte est utilisable en quelques secondes
- **Cache IndexedDB** : les visites suivantes chargent instantanément, sans réseau ; invalidation par checksum de la ressource data.gouv.fr
- Index spatial [supercluster](https://github.com/mapbox/supercluster) : clustering et requêtes par zone instantanés, même avec 100 000+ trajets
- Statistiques agrégées (nombre de trajets, distance totale, distance moyenne par zone)
- Popups détaillés (villes de départ/arrivée, date, distance, classe d'opérateur)

## Technologies

- React 19 + TypeScript (strict)
- Vite 7 (build) + Vitest (tests)
- React Leaflet 5 / Leaflet 1.9 (rendu canvas)
- Tailwind CSS 4
- PapaParse (parsing CSV en streaming)
- idb (cache IndexedDB)
- supercluster (index spatial)

## Démarrage

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
```

Autres commandes :

```bash
npm run build      # build de production dans build/
npm run preview    # sert le build localement
npm test           # tests vitest
npm run tsc        # vérification TypeScript
```

Variable d'environnement optionnelle : `VITE_MAX_TRIPS` (défaut `100000`) — nombre maximal de lignes chargées depuis le CSV (~720 octets/ligne téléchargés).

## Structure du projet

```
react-covoiturage-map/
├── index.html                  # Point d'entrée HTML (Vite)
├── vite.config.ts
├── src/
│   ├── config.ts               # URLs data.gouv.fr, caps, seuils de zoom
│   ├── data/
│   │   ├── streamTrips.ts      # Streaming fetch + parse progressif du CSV
│   │   ├── parseTrips.ts       # Mapping ligne CSV -> Trip (colonnes réelles RPC)
│   │   ├── tripCache.ts        # Cache IndexedDB + logique d'invalidation
│   │   ├── resourceMeta.ts     # Métadonnées de la ressource (checksum)
│   │   └── sampleTrips.ts      # Données de secours
│   ├── hooks/
│   │   └── useTripIndex.ts     # Index spatial supercluster
│   ├── contexts/
│   │   └── TripDataContext.tsx # État global (trajets, progression, sélection)
│   ├── components/
│   │   ├── Map.tsx             # Carte Leaflet, clusters, popup contrôlé
│   │   ├── InfoPanel.tsx
│   │   ├── MapLegend.tsx
│   │   └── MessageToast.tsx
│   ├── utils/format.ts         # Formatage fr-FR (nombres, distances, dates)
│   └── types/index.ts
└── deno.json                   # Déploiement statique (Deno Deploy sert build/)
```

## Données

Les trajets proviennent du [Registre de Preuve de Covoiturage sur data.gouv.fr](https://www.data.gouv.fr/fr/datasets/trajets-realises-en-covoiturage-registre-de-preuve-de-covoiturage/) : un CSV par mois (délimité par `;`), ~500-600k trajets/mois. Le fichier est servi avec CORS ouvert, ce qui permet le streaming direct depuis le navigateur. Le dernier mois disponible est détecté automatiquement via l'API du jeu de données, et un sélecteur dans le bandeau permet de naviguer entre les mois.

## Licence

Ce projet est sous licence MIT.
