# La Serenissima: Système de Détection de Problèmes

Ce document décrit le système de détection de problèmes au sein de La Serenissima. Ce système identifie dynamiquement diverses situations problématiques affectant les citoyens et leurs actifs, leur fournissant des informations et des solutions potentielles.

## Objectifs du Système de Problèmes

- **Informer les Joueurs** : Alerter les joueurs sur les problèmes critiques ou sous-optimaux concernant leurs citoyens, terres ou bâtiments.
- **Guider l'Action** : Suggérer des solutions concrètes que les joueurs peuvent entreprendre pour résoudre ces problèmes.
- **Améliorer l'Immersion** : Rendre le monde du jeu plus dynamique et réactif aux actions (ou inactions) des joueurs.
- **Faciliter la Prise de Décision Stratégique** : Aider les joueurs à prioriser leurs actions en fonction de la sévérité et de l'impact des problèmes.

## Types de Problèmes Détectés

Voici les types de problèmes actuellement gérés par le système :

### 1. Terres Non Bâties (No Buildings on Land)

-   **Description** : Ce problème est signalé lorsqu'un citoyen possède une parcelle de terrain mais n'y a construit aucun bâtiment.
-   **Détection** : Le système compare la liste des terrains appartenant à un citoyen avec la liste des bâtiments construits sur ces terrains. Si un terrain n'a aucun bâtiment associé, un problème est créé.
-   **Impact/Sévérité** : Moyen. Les terres non développées ne génèrent aucun revenu et peuvent être soumises à des taxes plus élevées (Vigesima Variabilis).
-   **Solutions Suggérées** :
    -   Construire des bâtiments sur le terrain.
    -   Vendre ou louer le terrain si le développement n'est pas envisagé.
-   **Note** : Le problème indique le nombre de points de construction disponibles sur le terrain.

### 2. Citoyen Sans Domicile (Homeless Citizen)

-   **Description** : Un citoyen est considéré comme sans domicile s'il n'est répertorié comme occupant d'aucun bâtiment de catégorie "résidentiel" (home).
-   **Détection** : Le système vérifie chaque citoyen pour s'assurer qu'il est l'occupant (`Occupant`) d'au moins un bâtiment dont la catégorie (`Category`) est "home".
-   **Impact/Sévérité** : Moyen. Le sans-abrisme peut affecter le bien-être du citoyen et sa productivité.
-   **Solutions Suggérées** :
    -   Chercher un logement disponible sur le marché.
    -   S'assurer d'avoir des fonds suffisants pour payer un loyer.
    -   Attendre l'attribution automatique de logement par le script quotidien (si applicable).

### 3. Impact Employé Sans Domicile (Homeless Employee Impact)

-   **Description** : Ce problème est signalé à un employeur si l'un de ses employés est sans domicile.
-   **Détection** : Lorsqu'un citoyen est identifié comme sans domicile (voir ci-dessus), le système vérifie s'il a un emploi. Si c'est le cas, et que l'employeur (`ranBy` dans la table des bâtiments professionnels) est différent de l'employé, un problème est créé pour l'employeur.
-   **Impact/Sévérité** : Faible. L'employeur est informé que la productivité de son employé pourrait être réduite jusqu'à 50%.
-   **Solutions Suggérées** :
    -   Discuter des options de logement avec l'employé.
    -   Fournir une assistance si possible.
    -   Surveiller les performances et envisager des alternatives de recrutement.

### 4. Citoyen Sans Emploi (Workless Citizen)

-   **Description** : Un citoyen est considéré comme sans emploi s'il n'est répertorié comme occupant d'aucun bâtiment de catégorie "commercial" (business).
-   **Détection** : Le système vérifie chaque citoyen (sauf les comptes système comme `ConsiglioDeiDieci` ou `SerenissimaBank`) pour s'assurer qu'il est l'occupant (`Occupant`) d'au moins un bâtiment dont la catégorie (`Category`) est "business".
-   **Impact/Sévérité** : Faible. Le chômage affecte la capacité du citoyen à gagner un revenu.
-   **Solutions Suggérées** :
    -   Chercher des opportunités d'emploi dans les entreprises disponibles.
    -   Améliorer ses compétences ou sa position sociale.
    -   Attendre l'attribution automatique d'emploi par le script quotidien (si applicable).

### 5. Logement Inoccupé (Vacant Home)

-   **Description** : Ce problème est signalé lorsqu'un bâtiment résidentiel (catégorie "home") a un propriétaire mais pas d'occupant.
-   **Détection** : Le système identifie les bâtiments avec `Category` = "home", un `Owner` valide, mais un champ `Occupant` vide.
-   **Impact/Sévérité** : Faible. Un logement vide ne génère pas de revenus locatifs et peut se détériorer.
-   **Solutions Suggérées** :
    -   Mettre le bien sur le marché locatif.
    -   Ajuster le loyer.
    -   Entretenir le bien.
    -   Vendre le bien.

### 6. Locaux Commerciaux Inoccupés (Vacant Business Premises)

-   **Description** : Ce problème est signalé lorsqu'un bâtiment commercial (catégorie "business") a un propriétaire mais pas d'occupant (travailleur).
-   **Détection** : Le système identifie les bâtiments avec `Category` = "business", un `Owner` valide, mais un champ `Occupant` vide.
-   **Impact/Sévérité** : Moyen. Des locaux commerciaux vides ne génèrent pas de revenus et n'ont pas d'activité économique.
-   **Solutions Suggérées** :
    -   Louer les locaux à un entrepreneur.
    -   Démarrer une nouvelle entreprise.
    -   S'assurer que la propriété est adaptée aux types d'entreprises courants.
    -   Vendre la propriété.

### 7. Absence de Contrats Actifs (No Active Contracts)

-   **Description** : Ce problème est signalé pour les bâtiments de catégorie "commercial" (business) qui ne sont impliqués dans aucun contrat actif (ni en tant qu'acheteur `BuyerBuilding`, ni en tant que vendeur `SellerBuilding`).
-   **Détection** : Le système récupère tous les bâtiments de catégorie "business". Ensuite, il récupère tous les contrats actifs (dont la date actuelle est entre `CreatedAt` et `EndAt`). Il identifie ensuite les bâtiments commerciaux qui n'apparaissent ni comme `BuyerBuilding` ni comme `SellerBuilding` dans ces contrats actifs.
-   **Impact/Sévérité** : Moyen. Un bâtiment commercial sans contrats actifs ne participe pas à l'économie, manquant des opportunités de revenus ou d'approvisionnement.
-   **Solutions Suggérées** :
    -   Créer des contrats de vente pour les biens ou services produits.
    -   Créer des contrats d'achat pour les matières premières ou les biens nécessaires.
    -   Analyser les prix du marché et la demande.
    -   S'assurer que l'entreprise est opérationnelle avec un occupant.

## Gestion et Affichage des Problèmes

### Détection

-   Les problèmes sont détectés via des scripts backend et des services API.
-   Le script principal `backend/problems/detectProblems.py` orchestre la détection de tous les types de problèmes en appelant les API correspondantes (par exemple, `/api/problems/no-buildings`, `/api/problems/homeless`, etc.).
-   Chaque API de problème utilise `ProblemService.ts` (dans `lib/services/`) pour implémenter la logique de détection spécifique.
-   Les problèmes détectés sont ensuite sauvegardés dans la table `PROBLEMS` d'Airtable via l'utilitaire `saveProblems` (dans `lib/utils/problemUtils.ts`), qui s'assure également de nettoyer les anciens problèmes actifs du même type pour le citoyen concerné avant d'en insérer de nouveaux.
-   Le script `backend/problems/detectSpecificProblems.py` peut être utilisé pour déclencher la détection d'un type de problème spécifique, potentiellement pour un utilisateur donné.

### Affichage

-   **Marqueurs de Problèmes** : Dans la vue isométrique (`PolygonViewer`), les problèmes actifs pour le joueur connecté sont affichés sous forme de petits marqueurs (points d'exclamation colorés) positionnés sur l'actif concerné (terrain ou bâtiment). La couleur du marqueur indique la sévérité du problème.
    -   Implémentation : `components/PolygonViewer/ProblemMarkers.tsx`
-   **Panneau de Détails du Problème** : Cliquer sur un marqueur de problème ouvre un panneau modal qui affiche des informations détaillées sur le problème, y compris sa description, sa localisation, sa sévérité, et les solutions suggérées.
    -   Implémentation : `components/UI/ProblemDetailsPanel.tsx`
-   **API de Problèmes** :
    -   `/api/problems` : Permet de récupérer les problèmes filtrés (par citoyen, type d'actif, statut).
    -   `/api/problems/[problemId]` : Permet de récupérer les détails d'un problème spécifique par son `ProblemId`.

## Structure d'un Problème

Chaque enregistrement de problème dans Airtable (et tel que traité par le système) contient généralement les champs suivants :

-   `ProblemId` (Texte) : Un identifiant unique pour cette instance de problème (par exemple, `homeless_citizenX_timestamp`).
-   `Citizen` (Texte) : Le nom d'utilisateur du citoyen concerné par le problème.
-   `AssetType` (Texte) : Le type d'actif concerné (par exemple, "land", "building", "citizen").
-   `AssetId` (Texte) : L'identifiant de l'actif concerné.
-   `Severity` (Single Select) : La gravité du problème (par exemple, "low", "medium", "high", "critical").
-   `Status` (Single Select) : Le statut actuel du problème (par exemple, "active", "resolved", "ignored").
-   `CreatedAt` (Date/Time) : La date et l'heure de création du problème.
-   `UpdatedAt` (Date/Time) : La date et l'heure de la dernière mise à jour du problème.
-   `Location` (Texte) : Une description textuelle de l'emplacement du problème (par exemple, nom du bâtiment, nom du terrain).
-   `Position` (Texte, JSON) : Les coordonnées géographiques (latitude, longitude) de l'actif concerné, stockées sous forme de chaîne JSON.
-   `Title` (Texte) : Un titre concis pour le problème (par exemple, "No Buildings on Land", "Homeless Citizen").
-   `Description` (Texte Long, Markdown) : Une description détaillée du problème.
-   `Solutions` (Texte Long, Markdown) : Des suggestions pour résoudre le problème.
-   `Notes` (Texte Long) : Notes internes ou informations supplémentaires.

Ce système vise à créer une expérience de jeu plus engageante et à aider les joueurs à gérer efficacement leur présence dans La Serenissima.
