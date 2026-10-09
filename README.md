# Simulateur cachets intermittents

Site statique (HTML, CSS, JS en modules ES, sans backend) qui chiffre le coût d'un intermittent du spectacle selon sa convention collective : minimum conventionnel, majorations, cotisations, coût employeur, frais d'intermédiaire de paie et devis d'équipe exportable en CSV et en PDF.

## Lancer en local

Le site lit `data/simulateur_data.json` avec `fetch` : il faut un petit serveur. Un double-clic sur `index.html` ne suffit pas.

```bash
npm run dev
```

Puis ouvrir http://localhost:4321. Sans npm : `python3 -m http.server 4321` dans ce dossier.

## Tests

```bash
npm install
npm test
```

Les tests (`tests/engine.test.js`, Vitest) couvrent les cas T1 à T20 du cahier des charges, dont l'exemple officiel Audiens 2026 (T14), ainsi que les totaux du devis, le CSV et les surcharges de paramètres.

## Structure

```
index.html, styles.css         page unique et feuille d'impression (PDF)
data/simulateur_data.json      seule source des chiffres
src/engine/                    moteur pur, sans DOM
  money.js                     centimes entiers, arrondis, formats fr-FR
  catalogue.js                 unités, filtres (genre, grille), paliers 1285
  poste.js                     minimum, plancher SMIC, majorations
  cotisations.js               cotisations ligne par ligne
  devis.js                     intermédiaires, abonnement, totaux
  export.js                    CSV et surcharges locales
src/ui/app.js                  interface
tests/engine.test.js           tests unitaires
```

## Mettre à jour les chiffres

Modifier `data/simulateur_data.json` suffit : aucun montant n'est écrit en dur dans le code.

- `null` = non trouvé. L'interface affiche « Non trouvé » et jamais 0 €.
- Une nouvelle ligne de grille s'ajoute dans `conventions.<clé>.lignes` avec les champs de minimum habituels (`minimum_journee_8h`, `minimum_semaine_39h`, `minimum_cachet`, etc.).
- Pour un réglage propre à votre structure (taux AT/MP, tarif Movinmotion négocié), utilisez plutôt la page **Sources et paramètres**. Les valeurs y sont gardées dans le navigateur, et un bouton permet de revenir à celles du JSON.

### Ajouts au JSON d'origine

Le fichier `data/` est une copie de `simulateur_data.json`, complétée par quelques valeurs nécessaires au calcul. Elles étaient jusque-là décrites en texte ou dans le cahier des charges :

| Clé | Valeur | Rôle |
|---|---|---|
| `cotisations.parametres_calcul` | T2 1 540 €/j, vieillesse artiste 360 €/j, FNAL × 1,115, CSG 98,25 %, 151,67 h, prorata /30 | assiettes plafonnées |
| `csg_crds.ventilation` | 6,8 % déductible + 2,9 % non déductible | net et bulletin |
| `3097_cinema.majorations.heures_au_dela_10h_total` | 2,0 | « +100 % plus +100 % spécifique » |
| `movinmotion.frais_dossier_credits`, `valeur_credit_ht` | 150 crédits, 1,15 à 1,45 € | frais de première inscription |

## Convertisseur budget HT → cachet

À l'étape 6, l'option « J'ai un budget HT » part d'un montant facturé, ou d'une enveloppe, et calcule le cachet brut maximal pour le métier choisi. Le budget doit couvrir le brut, les cotisations patronales et les frais de l'intermédiaire. L'abonnement mensuel n'est pas déduit, puisqu'il est compté une fois au total du devis. Le calcul cherche, au centime près, le plus grand brut qui tient dans le budget.

Si ce brut est inférieur au minimum conventionnel, un avertissement bloquant affiche le budget nécessaire et le montant qui manque. D'autres avertissements apparaissent selon les cas : cotisation non trouvée, minimum remplacé par le SMIC, GUSO non autorisé, présomption de salariat de l'artiste.

## Règles de calcul retenues

- **Assiette de la CSG/CRDS** : 98,25 % du brut, plus la part patronale de prévoyance. C'est ce qui permet de retrouver au centime les montants de l'exemple Audiens (11,47 € non déductible, net 312,07 €).
- **Taux horaire de référence** : arrondi au centime avant d'appliquer les majorations (51,17 € pour T1), comme sur un bulletin de paie.
- **Heures de nuit, de dimanche et de jour férié** : elles sont supposées distinctes, et le supplément s'ajoute au salaire de base. En 3097 pub, chaque majoration est plafonnée à +100 % (`plafond_cumul_conventionnel`).
- **2642** : les heures supplémentaires sont calculées à la semaine, sur la base de la semaine 39 h ÷ 40.
- **1285 et 3090** : les taux de majoration ne figurent pas dans les sources. Ils se saisissent à la main et sont marqués « Non trouvé ».
- **Plancher SMIC** : il s'applique aux unités horaires, journalières, hebdomadaires et mensuelles, mais pas aux cachets.

## Déploiement

Le dossier entier se dépose tel quel, sans étape de build :

- **Netlify** : glisser-déposer le dossier sur app.netlify.com/drop.
- **Vercel** : `npx vercel` dans le dossier (preset « Other »).
- **GitHub Pages** : pousser le dossier sur un dépôt, puis Settings → Pages → branche `main`, dossier racine.

Le dossier `node_modules/` ne sert qu'aux tests : inutile de le déployer.

---

Simulation indicative, ce n'est pas un conseil de paie. Voir l'avertissement complet en pied de page du site.
