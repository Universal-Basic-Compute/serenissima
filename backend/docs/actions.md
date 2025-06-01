# Actions des Citoyens dans La Serenissima

Ce document détaille les actions stratégiques et économiques que les citoyens peuvent entreprendre dans La Serenissima. Ces actions sont distinctes des activités quotidiennes (comme le repos, le travail à un poste) et représentent des décisions actives ayant un impact sur le patrimoine, les finances ou les relations du citoyen.

## Gestion Foncière et Immobilière

1.  **Faire une Offre sur un Terrain**
    *   **Type**: `bid_on_land`
    *   **Description**: Un citoyen place une enchère pour acquérir une parcelle de terrain mise en vente. Si son offre est la plus élevée à la clôture des enchères, il remporte le terrain.
    *   **Mécanisme Principal**: Implique généralement une interaction avec le système d'enchères de terrains, vérifiant les fonds du citoyen et enregistrant l'offre.
    *   **API Pertinente (Exemple)**: `POST /api/contracts` (avec `Type: "building_bid"` si les terrains sont traités comme des actifs via des contrats d'enchères, ou un endpoint spécifique pour les enchères foncières).

2.  **Acheter un Terrain Disponible**
    *   **Type**: `buy_available_land`
    *   **Description**: Un citoyen achète directement une parcelle de terrain qui est disponible à la vente à un prix fixe, sans passer par un système d'enchères.
    *   **Mécanisme Principal**: Vérification des fonds, transfert de propriété du terrain et des Ducats.
    *   **API Pertinente (Exemple)**: `POST /api/transactions/land/purchase` (endpoint hypothétique).

3.  **Initier un Projet de Construction de Bâtiment**
    *   **Type**: `initiate_building_project`
    *   **Description**: Un citoyen décide de construire un nouveau bâtiment sur un terrain qu'il possède ou pour lequel il a les droits. Cela inclut la sélection du type de bâtiment, le paiement des coûts initiaux (placement du plan via `/api/create-building-at-point`), et le lancement effectif du projet de construction (via `/api/actions/construct-building` qui peut impliquer la création d'un contrat de construction avec un atelier).
    *   **Mécanisme Principal**: Déduction des coûts, création d'un enregistrement de bâtiment avec un statut "en construction", et potentiellement création d'un contrat de construction.
    *   **APIs Pertinentes**: `POST /api/create-building-at-point`, `POST /api/actions/construct-building`.

4.  **Ajuster le Prix de Location d'un Terrain**
    *   **Type**: `adjust_land_lease_price`
    *   **Description**: Un propriétaire foncier modifie le montant du bail (`LeasePrice`) demandé aux propriétaires des bâtiments construits sur ses terrains.
    *   **Mécanisme Principal**: Mise à jour du champ `LeasePrice` sur les enregistrements des bâtiments concernés.
    *   **API Pertinente (Exemple)**: `PATCH /api/buildings/{buildingId}` (pour modifier le `LeasePrice` d'un bâtiment spécifique) ou un endpoint dédié pour les ajustements de baux par l'IA (`backend/ais/adjustleases.py`).

5.  **Ajuster le Prix de Loyer d'un Bâtiment**
    *   **Type**: `adjust_building_rent_price`
    *   **Description**: Un propriétaire de bâtiment modifie le loyer (`RentPrice`) demandé aux citoyens ou entreprises qui occupent ses propriétés.
    *   **Mécanisme Principal**: Mise à jour du champ `RentPrice` sur l'enregistrement du bâtiment.
    *   **API Pertinente (Exemple)**: `PATCH /api/buildings/{buildingId}` ou un endpoint dédié pour les ajustements de loyers par l'IA (`backend/ais/adjustrents.py`).

## Commerce et Contrats

6.  **Créer/Modifier un Contrat de Vente Publique**
    *   **Type**: `manage_public_sell_contract`
    *   **Description**: Un citoyen met en vente des ressources qu'il possède en créant une offre publique (`public_sell`). Il peut définir le type de ressource, la quantité, et le prix.
    *   **Mécanisme Principal**: Création ou mise à jour d'un enregistrement dans la table `CONTRACTS`.
    *   **API Pertinente**: `POST /api/contracts`.

7.  **Modifier le Prix d'une Vente Publique**
    *   **Type**: `modify_public_sell_price`
    *   **Description**: Un citoyen ajuste le prix d'une ressource qu'il a déjà mise en vente via un contrat `public_sell`.
    *   **Mécanisme Principal**: Mise à jour du champ `PricePerResource` d'un contrat existant. Souvent géré via la même logique que la création/modification de contrat.
    *   **API Pertinente**: `POST /api/contracts` (en utilisant l'ID de contrat existant pour mettre à jour).

8.  **Terminer un Contrat de Vente Publique**
    *   **Type**: `end_public_sell_contract`
    *   **Description**: Un citoyen retire du marché une offre de vente publique qu'il avait créée.
    *   **Mécanisme Principal**: Modification du statut du contrat (par exemple, en `ended_by_ai` ou `cancelled`) ou mise à jour de sa date de fin (`EndAt`).
    *   **API Pertinente**: `POST /api/contracts` (pour mettre à jour le statut/date de fin).

9.  **Créer/Modifier un Contrat d'Importation**
    *   **Type**: `manage_import_contract`
    *   **Description**: Un citoyen (souvent une IA gérant une entreprise) initie un contrat pour importer des ressources nécessaires à son activité.
    *   **Mécanisme Principal**: Création ou mise à jour d'un contrat de type `import`.
    *   **API Pertinente**: `POST /api/contracts`.

10. **Créer/Modifier une Offre de Stockage Public**
    *   **Type**: `manage_public_storage_offer`
    *   **Description**: Un citoyen possédant un bâtiment avec capacité de stockage (ex: entrepôt) offre cet espace à la location à d'autres citoyens pour leurs ressources.
    *   **Mécanisme Principal**: Création ou mise à jour d'un contrat de type `public_storage`.
    *   **API Pertinente**: `POST /api/contracts`.

11. **Faire une Offre d'Achat sur un Bâtiment Existant**
    *   **Type**: `bid_on_building`
    *   **Description**: Un citoyen propose d'acheter un bâtiment appartenant à un autre citoyen en soumettant une offre.
    *   **Mécanisme Principal**: Création d'un contrat de type `building_bid` avec le citoyen comme `Buyer` et le propriétaire actuel comme `Seller`.
    *   **API Pertinente**: `POST /api/contracts`.

12. **Accepter/Refuser une Offre sur un Bâtiment Possédé**
    *   **Type**: `respond_to_building_bid`
    *   **Description**: Un propriétaire de bâtiment répond à une offre d'achat (`building_bid`) reçue pour l'une de ses propriétés.
    *   **Mécanisme Principal**: Mise à jour du statut du contrat `building_bid` en `accepted` ou `refused`. Si acceptée, cela déclenchera le transfert de propriété et de fonds.
    *   **API Pertinente**: `POST /api/contracts` (pour mettre à jour le statut du contrat).

13. **Retirer une Offre d'Achat sur un Bâtiment**
    *   **Type**: `withdraw_building_bid`
    *   **Description**: Un citoyen annule une offre (`building_bid`) qu'il avait précédemment faite pour acheter un bâtiment.
    *   **Mécanisme Principal**: Mise à jour du statut du contrat `building_bid` en `withdrawn`.
    *   **API Pertinente**: `POST /api/contracts` (pour mettre à jour le statut du contrat).

14. **Créer/Gérer un Contrat d'Achat avec Majoration (Markup Buy Contract)**
    *   **Type**: `manage_markup_buy_contract`
    *   **Description**: Un citoyen établit un contrat pour acheter des biens à un prix majoré, souvent pour un besoin urgent ou une revente rapide. Cela indique une volonté de payer plus cher pour un accès immédiat ou garanti à des ressources.
    *   **Mécanisme Principal**: Création ou mise à jour d'un contrat de type `markup_buy` (ou un type similaire) où l'acheteur spécifie la ressource, la quantité, et le prix maximum qu'il est prêt à payer.
    *   **API Pertinente**: `POST /api/contracts`.

15. **Créer/Gérer un Contrat de Demande de Stockage (Storage Query Contract)**
    *   **Type**: `manage_storage_query_contract`
    *   **Description**: Un citoyen ou une entreprise cherchant activement de l'espace de stockage pour ses biens crée un contrat pour solliciter des offres de stockage. Ceci est distinct de l'offre de stockage publique (où un propriétaire propose son espace).
    *   **Mécanisme Principal**: Création ou mise à jour d'un contrat de type `storage_query` (ou un type similaire) détaillant les besoins en stockage (type de ressource, quantité, durée souhaitée).
    *   **API Pertinente**: `POST /api/contracts`.

## Gestion du Travail et des Entreprises

14. **Ajuster les Salaires d'une Entreprise**
    *   **Type**: `adjust_business_wages`
    *   **Description**: Un citoyen qui gère une entreprise (`RunBy`) modifie le montant des salaires (`Wages`) offerts aux employés de cette entreprise.
    *   **Mécanisme Principal**: Mise à jour du champ `Wages` sur l'enregistrement du bâtiment de l'entreprise.
    *   **API Pertinente (Exemple)**: `PATCH /api/buildings/{buildingId}` ou un endpoint dédié pour les ajustements de salaires par l'IA (`backend/ais/adjustwages.py`).

15. **Déléguer une Entreprise / Demander ou Prendre une Entreprise pour Soi**
    *   **Type**: `manage_business_operation`
    *   **Description**:
        *   **Déléguer**: Un citoyen IA qui gère trop d'entreprises peut en transférer la gestion (`RunBy`) à une autre IA.
        *   **Demander/Prendre**: Un citoyen (IA ou joueur) pourrait chercher à devenir l'opérateur (`RunBy`) d'une entreprise existante, potentiellement en négociant avec le propriétaire ou en répondant à une "offre d'emploi" pour un gestionnaire.
    *   **Mécanisme Principal**: Mise à jour du champ `RunBy` sur l'enregistrement du bâtiment de l'entreprise.
    *   **API Pertinente (Exemple)**: `PATCH /api/buildings/{buildingId}`.

## Finance

16. **Demander un Prêt**
    *   **Type**: `request_loan`
    *   **Description**: Un citoyen sollicite un emprunt financier, spécifiant le montant, et potentiellement le but ou les garanties.
    *   **Mécanisme Principal**: Création d'un enregistrement de prêt avec un statut "en attente d'approbation".
    *   **API Pertinente**: `POST /api/loans/apply`.

17. **Offrir un Prêt**
    *   **Type**: `offer_loan`
    *   **Description**: Un citoyen ou une institution disposant de fonds excédentaires propose des prêts à d'autres.
    *   **Mécanisme Principal**: Pourrait impliquer la création de "modèles de prêt" ou la réponse à des demandes de prêt.
    *   **API Pertinente (Exemple)**: `POST /api/loans` (pour créer une offre de prêt) ou gestion des demandes via l'interface.

18. **Retirer des Jetons COMPUTE / Injecter des $COMPUTE**
    *   **Type**: `manage_compute_tokens`
    *   **Description**:
        *   **Retirer**: Un joueur convertit ses Ducats en jeu en jetons $COMPUTE sur la blockchain.
        *   **Injecter**: Un joueur convertit des jetons $COMPUTE de la blockchain en Ducats en jeu.
    *   **Mécanisme Principal**: Interaction avec un service de portefeuille ou un smart contract pour gérer la conversion entre la monnaie en jeu et les tokens externes.
    *   **API Pertinente (Exemple)**: `POST /api/withdraw-compute` (pour le retrait). L'injection pourrait être gérée par un processus externe qui crédite ensuite le compte en jeu.

## Social et Communication

19. **Envoyer un Message**
    *   **Type**: `send_message`
    *   **Description**: Un citoyen rédige et envoie une communication textuelle à un autre citoyen.
    *   **Mécanisme Principal**: Création d'un enregistrement dans la table `MESSAGES`.
    *   **API Pertinente**: `POST /api/messages/send`.

20. **Répondre à un Message**
    *   **Type**: `reply_to_message`
    *   **Description**: Un citoyen formule et envoie une réponse à un message qu'il a reçu.
    *   **Mécanisme Principal**: Similaire à l'envoi d'un message, mais souvent dans le contexte d'une conversation existante.
    *   **API Pertinente**: `POST /api/messages/send`.

21. **Mettre à Jour son Profil Citoyen**
    *   **Type**: `update_citizen_profile`
    *   **Description**: Un citoyen modifie des informations personnelles de son profil, comme sa devise familiale, son blason, ou son ID Telegram.
    *   **Mécanisme Principal**: Mise à jour des champs correspondants dans l'enregistrement du citoyen.
    *   **API Pertinente**: `POST /api/citizens/update`.

22. **Gérer son Appartenance à une Guilde**
    *   **Type**: `manage_guild_membership`
    *   **Description**: Un citoyen postule pour rejoindre une guilde, accepte une invitation, quitte une guilde, ou participe aux activités de gouvernance de sa guilde.
    *   **Mécanisme Principal**: Mise à jour du champ `GuildId` du citoyen et potentiellement interaction avec des systèmes de gestion de guilde.
    *   **API Pertinente**: `POST /api/citizens/update-guild`.

23. **Générer/Enregistrer une Pensée Stratégique**
    *   **Type**: `log_strategic_thought`
    *   **Description**: Une IA citoyen réfléchit à sa situation actuelle, à ses objectifs, et formule une pensée ou une stratégie. Cette réflexion est ensuite enregistrée.
    *   **Mécanisme Principal**: Appel à un moteur d'IA (Kinos) pour générer la pensée, puis création d'un message de type `thought_log` ou `unguided_run_log` du citoyen à lui-même.
    *   **Scripts Pertinents**: `backend/ais/generatethoughts.py`, `backend/ais/autonomouslyRun.py`.

24. **Marquer des Notifications comme Lues**
    *   **Type**: `mark_notifications_read`
    *   **Description**: Un citoyen consulte ses notifications et les marque comme ayant été lues.
    *   **Mécanisme Principal**: Mise à jour du champ `ReadAt` des enregistrements de notification.
    *   **API Pertinente**: `POST /api/notifications/mark-read`.

## Personnalisation

25. **Télécharger un Blason**
    *   **Type**: `upload_coat_of_arms`
    *   **Description**: Un joueur télécharge une image personnalisée pour servir de blason à son citoyen.
    *   **Mécanisme Principal**: Envoi d'un fichier image au serveur, qui le stocke et met à jour l'URL du blason du citoyen.
    *   **API Pertinente**: `POST /api/upload-coat-of-arms`.

26. **Mettre à Jour les Paramètres Citoyen**
    *   **Type**: `update_citizen_settings`
    *   **Description**: Un joueur modifie des paramètres de jeu personnels, comme le volume de la musique, les effets sonores, la qualité graphique, etc.
    *   **Mécanisme Principal**: Enregistrement des préférences du joueur, souvent associées à son compte ou portefeuille.
    *   **API Pertinente**: `POST /api/citizen/settings`.
