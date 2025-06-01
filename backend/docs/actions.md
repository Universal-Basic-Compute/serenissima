# Actions Stratégiques des Citoyens (en tant qu'Activités)

Ce document détaille les actions stratégiques et économiques que les citoyens peuvent entreprendre dans La Serenissima. Conformément au modèle unifié, **ces "actions" sont initiées en tant qu'"activités" via l'endpoint `POST /api/activities/try-create`**. Chaque action listée ci-dessous correspondra à un `activityType` spécifique.

L'initiation via `try-create` permettra au moteur Python de déterminer la séquence d'activités nécessaire. Par exemple, une action `bid_on_land` pourrait d'abord générer une activité `goto_citizen` pour se rendre auprès du vendeur ou d'un notaire, avant que l'enchère elle-même ne soit traitée. Chaque étape pertinente de ce processus aura un enregistrement dans la table `ACTIVITIES`.

Les `Type` listés ci-dessous sont les `activityType` à utiliser avec `POST /api/activities/try-create`. Les `actionParameters` (qui deviendront `activityParameters` dans le corps de la requête à `/api/activities/try-create`) pour cet endpoint devront contenir les informations spécifiques à chaque action.

## Gestion Foncière et Immobilière

1.  **Faire une Offre sur un Terrain**
    *   **activityType**: `bid_on_land`
    *   **Description**: Un citoyen initie le processus pour placer une enchère sur une parcelle de terrain. Cela peut impliquer des étapes préliminaires (ex: se rendre à un lieu spécifique) avant que l'enchère ne soit formellement enregistrée.
    *   **Mécanisme Principal**: Crée une activité (ou une série d'activités) dans la table `ACTIVITIES`. Le processeur de cette activité gérera la logique de l'enchère, potentiellement après des étapes intermédiaires. L'enregistrement final de l'enchère se fera probablement via un appel interne à `POST /api/contracts` par le processeur d'activité.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `bidAmount`.

2.  **Acheter un Terrain Disponible**
    *   **activityType**: `buy_available_land`
    *   **Description**: Un citoyen initie le processus d'achat direct d'une parcelle de terrain disponible à un prix fixe.
    *   **Mécanisme Principal**: Crée une activité. Le processeur de cette activité gérera la vérification des fonds, le transfert de propriété et des Ducats, potentiellement via un appel interne à un service de transaction (ex: `POST /api/transactions/land/purchase` ou logique équivalente).
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `expectedPrice`.

3.  **Initier un Projet de Construction de Bâtiment**
    *   **activityType**: `initiate_building_project`
    *   **Description**: Un citoyen initie le processus de construction d'un nouveau bâtiment. Cela peut impliquer le placement du plan (via `/api/create-building-at-point`), le paiement des coûts initiaux, et la création d'un contrat de construction (via `/api/actions/construct-building`).
    *   **Mécanisme Principal**: Crée une activité (ou une série d'activités). Les processeurs géreront la déduction des coûts, la création de l'enregistrement du bâtiment (non construit), et la création du contrat de construction.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `buildingTypeDefinition` (objet JSON complet de la définition du type de bâtiment), `pointDetails` (objet JSON avec `lat`, `lng`, `polygonId`, `pointType`), `builderContractDetails` (optionnel, objet JSON avec `sellerUsername`, `sellerBuildingId`, `rate`, `publicContractId`).

4.  **Ajuster le Prix de Location d'un Terrain**
    *   **activityType**: `adjust_land_lease_price`
    *   **Description**: Un propriétaire foncier initie le processus de modification du bail (`LeasePrice`) pour les bâtiments sur ses terrains.
    *   **Mécanisme Principal**: Crée une activité. Le processeur de cette activité mettra à jour le `LeasePrice` sur les bâtiments concernés, potentiellement via un appel interne à `PATCH /api/buildings/{buildingId}` ou une logique similaire à `backend/ais/adjustleases.py` ou `backend/ais/automated_adjustleases.py`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId` (du bâtiment dont le bail est ajusté) OU `landId` (pour ajuster tous les baux sur ce terrain), `newLeasePrice`, `strategy` (optionnel, ex: "standard", "low", "high" pour guider la logique automatisée).

5.  **Ajuster le Prix de Loyer d'un Bâtiment**
    *   **activityType**: `adjust_building_rent_price`
    *   **Description**: Un propriétaire de bâtiment initie la modification du loyer (`RentPrice`) pour sa propriété.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le `RentPrice` du bâtiment, potentiellement via `PATCH /api/buildings/{buildingId}` ou une logique similaire à `backend/ais/adjustrents.py` ou `backend/ais/automated_adjustrents.py`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId`, `newRentPrice`, `strategy` (optionnel, ex: "standard", "low", "high").

## Commerce et Contrats

6.  **Créer/Modifier un Contrat de Vente Publique**
    *   **activityType**: `manage_public_sell_contract`
    *   **Description**: Un citoyen initie la création ou la modification d'une offre de vente publique (`public_sell`).
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la création/mise à jour du contrat via un appel interne à `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel, pour modification), `resourceType`, `pricePerResource`, `targetAmount`, `sellerBuildingId`.

7.  **Modifier le Prix d'une Vente Publique**
    *   **activityType**: `modify_public_sell_price` (Note: `manage_public_sell_contract` avec un `contractId` existant est la méthode préférée pour modifier un contrat, y compris son prix.)
    *   **Description**: Un citoyen initie l'ajustement du prix d'un contrat `public_sell` existant.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `newPricePerResource`.

8.  **Terminer un Contrat de Vente Publique**
    *   **activityType**: `end_public_sell_contract`
    *   **Description**: Un citoyen initie la clôture d'une offre de vente publique.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le statut/date de fin du contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`.

9.  **Créer/Modifier un Contrat d'Importation**
    *   **activityType**: `manage_import_contract`
    *   **Description**: Un citoyen initie la création ou modification d'un contrat d'importation.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la création/mise à jour du contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `pricePerResource`, `buyerBuildingId`.

10. **Créer/Modifier une Offre de Stockage Public**
    *   **activityType**: `manage_public_storage_offer`
    *   **Description**: Un citoyen initie la création/modification d'une offre de stockage public.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la création/mise à jour du contrat `public_storage` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `sellerBuildingId` (l'entrepôt), `resourceType` (ou "any"), `capacityOffered` (quantité d'espace), `pricePerUnitPerDay` (prix par unité de capacité par jour), `pricingStrategy` (optionnel, ex: "low", "standard", "high" pour guider `automated_adjustpublicstoragecontracts.py`).

11. **Faire une Offre d'Achat sur un Bâtiment Existant**
    *   **activityType**: `bid_on_building`
    *   **Description**: Un citoyen initie une offre d'achat pour un bâtiment existant.
    *   **Mécanisme Principal**: Crée une activité. Le processeur créera un contrat `building_bid` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingIdToBidOn`, `bidAmount`.

12. **Accepter/Refuser une Offre sur un Bâtiment Possédé**
    *   **activityType**: `respond_to_building_bid`
    *   **Description**: Un propriétaire de bâtiment initie une réponse à une offre d'achat.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le statut du contrat `building_bid` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `response` ("accepted" ou "refused").

13. **Retirer une Offre d'Achat sur un Bâtiment**
    *   **activityType**: `withdraw_building_bid`
    *   **Description**: Un citoyen initie le retrait d'une offre d'achat qu'il a faite.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le statut du contrat `building_bid` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`.

14. **Créer/Gérer un Contrat d'Achat avec Majoration (Markup Buy Contract)**
    *   **activityType**: `manage_markup_buy_contract`
    *   **Description**: Un citoyen initie la création/modification d'un contrat d'achat avec majoration.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la création/mise à jour du contrat `markup_buy` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `maxPricePerResource`, `buyerBuildingId`.

15. **Créer/Gérer un Contrat de Demande de Stockage (Storage Query Contract)**
    *   **activityType**: `manage_storage_query_contract`
    *   **Description**: Un citoyen initie la création/modification d'un contrat de demande de stockage.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la création/mise à jour du contrat `storage_query` via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `amountNeeded`, `durationDays`, `buyerBuildingId`.

## Gestion du Travail et des Entreprises

16. **Ajuster les Salaires d'une Entreprise**
    *   **activityType**: `adjust_business_wages`
    *   **Description**: Un gestionnaire d'entreprise (`RunBy`) initie la modification des salaires.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le champ `Wages` du bâtiment, potentiellement via `PATCH /api/buildings/{buildingId}` ou une logique similaire à `backend/ais/adjustwages.py` ou `backend/ais/automated_adjustwages.py`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newWageAmount`, `strategy` (optionnel, ex: "standard", "low", "high").

17. **Déléguer une Entreprise / Demander ou Prendre une Entreprise pour Soi**
    *   **activityType**: `manage_business_operation`
    *   **Description**: Un citoyen initie un changement dans la gestion (`RunBy`) d'une entreprise.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le champ `RunBy` du bâtiment, potentiellement via `PATCH /api/buildings/{buildingId}`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newOperatorUsername` (pour déléguer/prendre), `reason` (optionnel).

## Finance

18. **Demander un Prêt**
    *   **activityType**: `request_loan`
    *   **Description**: Un citoyen initie une demande de prêt.
    *   **Mécanisme Principal**: Crée une activité. Le processeur créera un enregistrement de prêt via `POST /api/loans/apply`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `amount`, `purpose`, `collateralDetails` (optionnel).

19. **Offrir un Prêt**
    *   **activityType**: `offer_loan`
    *   **Description**: Un citoyen initie une offre de prêt à un autre citoyen ou au public.
    *   **Mécanisme Principal**: Crée une activité. Le processeur créera une offre de prêt via `POST /api/loans`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `targetBorrowerUsername` (optionnel, si prêt direct), `amount`, `interestRate`, `termDays`.

20. **Retirer des Jetons COMPUTE**
    *   **activityType**: `withdraw_compute_tokens`
    *   **Description**: Un joueur initie le processus de conversion de Ducats en jetons $COMPUTE.
    *   **Mécanisme Principal**: Crée une activité. Le processeur interagira avec `POST /api/withdraw-compute`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `ducatsAmount`, `walletAddress`.

21. **Injecter des Jetons COMPUTE**
    *   **activityType**: `inject_compute_tokens`
    *   **Description**: Un joueur initie le processus de conversion de jetons $COMPUTE en Ducats.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera la logique de vérification et de crédit, potentiellement via un appel interne à `/api/transfer-compute`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `computeTokenAmount`, `transactionProof` (détails de la transaction blockchain).

## Social et Communication

22. **Envoyer un Message**
    *   **activityType**: `send_message`
    *   **Description**: Un citoyen initie l'envoi d'un message.
    *   **Mécanisme Principal**: Crée une activité. Le processeur créera l'enregistrement du message via `POST /api/messages/send`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `receiverUsername`, `content`, `messageType` (optionnel).

23. **Répondre à un Message**
    *   **activityType**: `reply_to_message`
    *   **Description**: Un citoyen initie une réponse à un message reçu.
    *   **Mécanisme Principal**: Crée une activité. Le processeur enverra la réponse via `POST /api/messages/send`, potentiellement en liant au message d'origine.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `originalMessageId`, `receiverUsername` (de l'expéditeur original), `content`, `messageType` (optionnel).

24. **Mettre à Jour son Profil Citoyen**
    *   **activityType**: `update_citizen_profile`
    *   **Description**: Un citoyen initie la mise à jour de son profil.
    *   **Mécanisme Principal**: Crée une activité. Le processeur mettra à jour le profil via `POST /api/citizens/update`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `citizenAirtableId` (ID Airtable du citoyen à mettre à jour), `firstName`, `lastName`, `familyMotto`, `coatOfArmsImageUrl`, `telegramUserId` (tous optionnels).

25. **Gérer son Appartenance à une Guilde**
    *   **activityType**: `manage_guild_membership`
    *   **Description**: Un citoyen initie une action liée à sa guilde (rejoindre, quitter, etc.).
    *   **Mécanisme Principal**: Crée une activité. Le processeur interagira avec `POST /api/citizens/update-guild` ou des API de guilde spécifiques.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `guildId`, `membershipAction` ("join", "leave", "accept_invite").

26. **Générer/Enregistrer une Pensée Stratégique**
    *   **activityType**: `log_strategic_thought`
    *   **Description**: Une IA citoyen initie le processus de génération et d'enregistrement d'une pensée stratégique.
    *   **Mécanisme Principal**: Crée une activité. Le processeur appellera Kinos (ou une logique interne) pour générer la pensée, puis créera un message `thought_log`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `context` (optionnel, pour guider la pensée), `visibility` ("private", "public_short").

27. **Marquer des Notifications comme Lues**
    *   **activityType**: `mark_notifications_read`
    *   **Description**: Un citoyen initie le marquage de notifications comme lues.
    *   **Mécanisme Principal**: Crée une activité. Le processeur appellera `POST /api/notifications/mark-read`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `notificationIds` (tableau d'IDs ou "all_unread").

## Personnalisation

28. **Télécharger un Blason**
    *   **activityType**: `upload_coat_of_arms`
    *   **Description**: Un joueur initie le téléchargement d'un blason.
    *   **Mécanisme Principal**: Crée une activité. Le processeur gérera l'upload via `POST /api/upload-coat-of-arms`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `imageData` (données de l'image en base64 ou similaire, ou un mécanisme pour que le serveur récupère un fichier temporaire), `filename` (optionnel).

29. **Mettre à Jour les Paramètres Citoyen**
    *   **activityType**: `update_citizen_settings`
    *   **Description**: Un joueur initie la mise à jour de ses paramètres de jeu.
    *   **Mécanisme Principal**: Crée une activité. Le processeur enregistrera les paramètres via `POST /api/citizen/settings`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `settingsObject` (contenant les paires clé-valeur des paramètres).
