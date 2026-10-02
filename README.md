# Grocyste — Équivalents et fourchettes

Equivalents compare les références éligibles d’une famille pour afficher une fourchette dans la liste de courses. Le calcul tient compte des conditionnements entiers à acheter.

**Manifeste 1.0.0 · Grocy 4.7.1 · CORE >=1.0.0 <2.0.0 · GPL-3.0-only.**

## Installer

Installez le [CORE Grocyste](https://github.com/Raph563/Grocyste), puis ouvrez **Réglages → Grocyste — Assaisonnements** avec un compte administrateur et choisissez ce paquet dans le catalogue signé. Le gestionnaire vérifie signature et dépendances avant activation. La disponibilité publique doit être confirmée par le rapport de publication.

**Dépendances :** [Budgets](https://github.com/Raph563/Grocyste-Budgets) `>=1.0.0 <2.0.0`, qui dépend de RecipeScaling.

## Utilisation et contrat

Chaque comparaison repose sur une identité, une contenance, un prix et une dimension compatibles. Le montant payable arrondit le nombre de conditionnements au supérieur. Une famille absente ou incomplète conserve un résultat qualifié.

## Limites

Aucune équivalence, aucun prix ni aucune densité n’est inventé. Une variante ressemblante n’est pas automatiquement substituable ; les références d’une instance doivent être collectées et vérifiées séparément.

Les addons partagent le contexte JavaScript de Grocy : installez du code auquel vous faites confiance. Le lot cible Grocy 4.7.1 uniquement.

## Développer et vérifier

Node.js 24 ; aucune dépendance npm à installer pour les tests du dépôt.

```sh
npm test
npm run build
```

La CI vérifie tests et construction sans clé privée. Les tests locaux ne remplacent pas la qualification sur une instance Grocy, en cours et à documenter dans le [rapport de compatibilité du CORE](https://github.com/Raph563/Grocyste/blob/main/docs/compatibilite.md).

## Sources et licence

Voir [PROVENANCE.md](PROVENANCE.md) et [LICENSE](LICENSE). Les sources et notices accompagnent le paquet ; `build-files.txt` décrit son contenu exact. Aucun reçu, stock, clé ou donnée privée d’une instance n’est intégré.
