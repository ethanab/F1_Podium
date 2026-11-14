# 🏁 F1 Podium — widget iPhone

Widget pour l'écran d'accueil de l'iPhone qui affiche :

- **Un podium illustré** : le vainqueur en grand au centre (photo + nom), sa voiture derrière lui, P2 et P3 de chaque côté, sur des marches aux couleurs des écuries
- **Le reste du top 10** (P4 à P10 : position, couleur de l'écurie, pilote, écart)
- **Le classement constructeurs** (points de chaque écurie)
- **Le prochain Grand Prix** (nom, date/heure locale, compte à rebours `J-6 4h`, mention Sprint)

Le widget tourne avec l'app gratuite **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** : pas besoin de Mac, d'Xcode ni de compte développeur.
Les données viennent de l'API publique [Jolpica F1](https://github.com/jolpica/jolpica-f1) (successeur d'Ergast), sans clé d'API.

## Installation (5 minutes)

1. Installer **Scriptable** depuis l'App Store.
2. Ouvrir [`F1Widget.js`](F1Widget.js) sur l'iPhone (bouton *Raw* sur GitHub), tout sélectionner, copier.
3. Dans Scriptable : **+** → coller le code → renommer le script `F1 Podium` → **Done**.
4. Toucher le script une fois pour vérifier l'aperçu.
5. Écran d'accueil : appui long → **+** → **Scriptable** → choisir la taille **Grande** → **Ajouter le widget**.
6. Appui long sur le widget → **Modifier le widget** → *Script* : `F1 Podium`.

## Tailles

| Taille | Contenu |
|--------|---------|
| **Grande** (recommandée) | Podium illustré + P4–P10 + classement constructeurs + prochain GP |
| Moyenne | Podium illustré + P4–P10 + prochain GP |
| Petite | Podium + prochain GP |

## Fonctionnement

- Rafraîchissement demandé toutes les 60 min (iOS décide du moment exact).
- Les dernières données sont mises en cache : sans réseau, le widget affiche le dernier état avec la mention « hors ligne ».
- En fin de saison, le prochain GP est cherché dans le calendrier de l'année suivante.
- Photos des pilotes : API [OpenF1](https://openf1.org) (`headshot_url`). Image de la voiture : CDN de formula1.com.
  Les images sont gardées en cache sur l'iPhone. Si une image est introuvable, le widget dessine à la place une pastille (code pilote) ou un halo aux couleurs de l'écurie.
- Toucher le widget ouvre la page des résultats sur formula1.com.

## Personnalisation

En haut de `F1Widget.js` :

- `REFRESH_MINUTES` — fréquence de rafraîchissement
- `TEAM_COLORS` / `TEAM_SHORT` — couleurs et noms courts des écuries (clé = `constructorId` de l'API)
- `CAR_IMAGE_OVERRIDES` — URL d'image de voiture à utiliser pour une écurie, ex. `{ mclaren: "https://…/voiture.png" }` (PNG à fond transparent conseillé)
- `CAR_SLUGS` — nom d'écurie utilisé dans les URL d'images de formula1.com
- `LOCALE` — langue des dates (`fr_FR` par défaut)
