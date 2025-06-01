# Actions Stratégiques des Citoyens (en tant qu'Activités)

Ce document détaille les actions stratégiques et économiques que les citoyens peuvent entreprendre dans La Serenissima. Conformément au modèle unifié, **ces "actions" sont initiées en tant qu'"activités" via l'endpoint `POST /api/activities/try-create`**. Chaque action listée ci-dessous correspondra à un `activityType` spécifique.

L'initiation via `try-create` permettra au moteur Python de déterminer la séquence d'activités nécessaire. Par exemple, une action `bid_on_land` pourrait d'abord générer une activité `goto_citizen` pour se rendre auprès du vendeur ou d'un notaire, avant que l'enchère elle-même ne soit traitée. Chaque étape pertinente de ce processus aura un enregistrement dans la table `ACTIVITIES`.

Les `Type` listés ci-dessous sont les `activityType` à utiliser avec `POST /api/activities/try-create`. Les `actionParameters` (qui deviendront `activityParameters` dans le corps de la requête à `/api/activities/try-create`) pour cet endpoint devront contenir les informations spécifiques à chaque action.

## Gestion Foncière et Immobilière

1.  **Faire une Offre sur un Terrain**
    *   **activityType**: `bid_on_land`
    *   **Description**: Le citoyen se déplace physiquement vers un lieu officiel (ex: `courthouse` ou `town_hall`) pour y soumettre formellement une offre sur une parcelle de terrain. L'enregistrement de l'offre se fait après cette interaction sur place.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `courthouse` ou `town_hall`). Une fois arrivé, une activité de soumission d'offre (`activityType: submit_land_bid_offer`, durée courte) est créée. Le processeur de `submit_land_bid_offer` appellera `POST /api/contracts` pour enregistrer l'enchère.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `bidAmount`, `targetBuildingId` (optionnel, ID du `courthouse` ou `town_hall` pertinent).

2.  **Acheter un Terrain Disponible**
    *   **activityType**: `buy_available_land`
    *   **Description**: Le citoyen se déplace physiquement vers un lieu officiel (ex: `courthouse` ou `town_hall`) pour y finaliser l'achat direct d'une parcelle de terrain. La transaction (vérification des fonds, transfert de propriété) est effectuée après cette interaction sur place.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `courthouse` ou `town_hall`). Une fois arrivé, une activité de finalisation d'achat (`activityType: finalize_land_purchase_transaction`, durée courte) est créée. Le processeur de cette dernière gérera la transaction.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `expectedPrice`, `targetBuildingId` (optionnel, ID du `courthouse` ou `town_hall` pertinent).

3.  **Initier un Projet de Construction de Bâtiment**
    *   **activityType**: `initiate_building_project`
    *   **Description**: Le citoyen se rend sur le terrain (`landId`), puis potentiellement à un `town_hall` (bureau d'urbanisme) ou à un `masons_lodge` / `master_builders_workshop` (atelier de constructeur) pour soumettre les plans et lancer le projet.
    *   **Mécanisme Principal**: Séquence d'activités : `goto_land_plot` (pour inspection), puis `goto_location` (vers `town_hall` ou l'atelier du constructeur si `builderContractDetails` fourni). À la destination finale, une activité `submit_building_project` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `buildingTypeDefinition`, `pointDetails`, `builderContractDetails` (optionnel, incluant `sellerBuildingId` qui pourrait être un `masons_lodge` ou `master_builders_workshop`), `targetOfficeBuildingId` (optionnel, ID du `town_hall` ou de l'atelier).

4.  **Ajuster le Prix de Location d'un Terrain**
    *   **activityType**: `adjust_land_lease_price`
    *   **Description**: Le propriétaire foncier se rend à son domicile, à un bureau qu'il gère, ou à un `public_archives` (bureau du cadastre) pour enregistrer la modification du bail.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou `public_archives`). À l'arrivée, une activité `file_lease_adjustment` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId` ou `landId`, `newLeasePrice`, `strategy`, `targetOfficeBuildingId` (optionnel, ID du `public_archives`).

5.  **Ajuster le Prix de Loyer d'un Bâtiment**
    *   **activityType**: `adjust_building_rent_price`
    *   **Description**: Le propriétaire du bâtiment se rend à son domicile, bureau, ou un `public_archives` pour enregistrer la modification du loyer.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou `public_archives`). À l'arrivée, une activité `file_rent_adjustment` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId`, `newRentPrice`, `strategy`, `targetOfficeBuildingId` (optionnel, ID du `public_archives`).

## Commerce et Contrats

6.  **Créer/Modifier un Contrat de Vente Publique**
    *   **activityType**: `manage_public_sell_contract`
    *   **Description**: Le citoyen se rend à son bâtiment de vente (`sellerBuildingId`) pour préparer les marchandises, puis se déplace vers un lieu de marché (ex: `market_stall`, `merceria`, `weighing_station`) pour y enregistrer ou modifier son offre de vente publique.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `sellerBuildingId`). À l'arrivée, une activité de préparation (`activityType: prepare_goods_for_sale`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `market_stall`, etc.) est créée. Finalement, une activité d'enregistrement de contrat (`activityType: register_public_sell_offer`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `pricePerResource`, `targetAmount`, `sellerBuildingId`, `targetMarketBuildingId` (ID du `market_stall`, `merceria`, ou `weighing_station`).

7.  **Modifier le Prix d'une Vente Publique**
    *   **activityType**: `modify_public_sell_price` (Note: `manage_public_sell_contract` avec un `contractId` existant est la méthode préférée.)
    *   **Description**: Le citoyen se rend à un lieu de marché (ex: `market_stall`, `weighing_station`) ou à son bâtiment de vente pour y soumettre une modification de prix pour un contrat de vente publique existant.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `market_stall` ou `sellerBuildingId`). À l'arrivée, une activité de modification de prix (`activityType: submit_price_modification`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `newPricePerResource`, `targetBuildingId` (ID du lieu de modification).

8.  **Terminer un Contrat de Vente Publique**
    *   **activityType**: `end_public_sell_contract`
    *   **Description**: Le citoyen se rend à un lieu de marché (ex: `market_stall`, `weighing_station`) ou à son bâtiment de vente pour y notifier la fin de son offre de vente publique.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `market_stall` ou `sellerBuildingId`). À l'arrivée, une activité de terminaison de contrat (`activityType: submit_contract_termination`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `targetBuildingId` (ID du lieu de notification).

9.  **Créer/Modifier un Contrat d'Importation**
    *   **activityType**: `manage_import_contract`
    *   **Description**: Le citoyen se rend à son bâtiment d'achat (`buyerBuildingId`) pour évaluer ses besoins, puis se déplace vers un bureau de commerce (ex: `customs_house`, `broker_s_office`) pour y enregistrer ou modifier un contrat d'importation.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `buyerBuildingId`). À l'arrivée, une activité d'évaluation des besoins (`activityType: assess_import_needs`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `customs_house` ou `broker_s_office`) est créée. Finalement, une activité d'enregistrement de contrat (`activityType: register_import_agreement`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `pricePerResource`, `buyerBuildingId`, `targetOfficeBuildingId` (ID du `customs_house` ou `broker_s_office`).

10. **Créer/Modifier une Offre de Stockage Public**
    *   **activityType**: `manage_public_storage_offer`
    *   **Description**: Le citoyen se rend à son bâtiment de stockage (`sellerBuildingId`, ex: `small_warehouse`, `granary`) pour évaluer la capacité, puis se déplace vers un lieu de marché (ex: `weighing_station`) pour y enregistrer/modifier son offre de stockage.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `sellerBuildingId`). À l'arrivée, une activité d'évaluation de capacité (`activityType: assess_storage_capacity`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `weighing_station` ou `market_stall`) est créée. Finalement, une activité d'enregistrement d'offre (`activityType: register_public_storage_contract`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `sellerBuildingId` (ID de l'entrepôt), `resourceType` (ou "any"), `capacityOffered`, `pricePerUnitPerDay`, `pricingStrategy`, `targetMarketBuildingId` (optionnel, ID du lieu de marché).

11. **Faire une Offre d'Achat sur un Bâtiment Existant**
    *   **activityType**: `bid_on_building`
    *   **Description**: Le citoyen se rend au bâtiment cible (`buildingIdToBidOn`) pour l'inspecter. Ensuite, il se déplace vers un lieu officiel (ex: `courthouse`, `town_hall`) ou rencontre le propriétaire (`targetOwnerUsername`) pour soumettre formellement son offre d'achat.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `buildingIdToBidOn`) pour inspection. À l'arrivée, une activité d'inspection (`activityType: inspect_building_for_purchase`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `courthouse`/`town_hall` ou localisation du `targetOwnerUsername`) est créée. Finalement, une activité de soumission d'offre (`activityType: submit_building_purchase_offer`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingIdToBidOn`, `bidAmount`, `targetOwnerUsername` (optionnel), `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`).

12. **Accepter/Refuser une Offre sur un Bâtiment Possédé**
    *   **activityType**: `respond_to_building_bid`
    *   **Description**: Le propriétaire du bâtiment se rend à un lieu officiel (ex: `courthouse`, `town_hall`) ou rencontre l'enchérisseur (`bidderUsername`) pour communiquer formellement sa décision (accepter ou refuser) concernant une offre d'achat.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `courthouse`/`town_hall` ou localisation du `bidderUsername`). À l'arrivée, une activité de communication de décision (`activityType: communicate_bid_response`, durée courte) est créée, dont le processeur mettra à jour le contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `response` ("accepted" ou "refused"), `bidderUsername` (optionnel, pour le déplacement), `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`).

13. **Retirer une Offre d'Achat sur un Bâtiment**
    *   **activityType**: `withdraw_building_bid`
    *   **Description**: L'enchérisseur se rend à un lieu officiel (ex: `courthouse`, `town_hall`) ou rencontre le propriétaire du bâtiment (`targetOwnerUsername`) pour notifier formellement le retrait de son offre d'achat.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `courthouse`/`town_hall` ou localisation du `targetOwnerUsername`). À l'arrivée, une activité de notification de retrait (`activityType: notify_bid_withdrawal`, durée courte) est créée, dont le processeur mettra à jour le contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `targetOwnerUsername` (optionnel, pour le déplacement), `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`).

14. **Créer/Gérer un Contrat d'Achat avec Majoration (Markup Buy Contract)**
    *   **activityType**: `manage_markup_buy_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer un besoin urgent, puis se déplace vers un lieu de marché (ex: `market_stall`, `weighing_station`) pour y enregistrer un contrat d'achat avec majoration.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `buyerBuildingId`). À l'arrivée, une activité d'évaluation (`activityType: assess_urgent_need`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `market_stall`/`weighing_station`) est créée. Finalement, une activité d'enregistrement de contrat (`activityType: register_markup_buy_agreement`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `maxPricePerResource`, `buyerBuildingId`, `targetMarketBuildingId` (ID du lieu de marché).

15. **Créer/Gérer un Contrat de Demande de Stockage (Storage Query Contract)**
    *   **activityType**: `manage_storage_query_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer ses besoins de stockage, puis se déplace vers un lieu de marché (ex: `market_stall`, `weighing_station`) pour y enregistrer une demande de stockage.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `buyerBuildingId`). À l'arrivée, une activité d'évaluation (`activityType: assess_storage_needs`, durée courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `market_stall`/`weighing_station`) est créée. Finalement, une activité d'enregistrement de demande (`activityType: register_storage_request_contract`, durée courte) est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `amountNeeded`, `durationDays`, `buyerBuildingId`, `targetMarketBuildingId` (ID du lieu de marché).

## Gestion du Travail et des Entreprises

16. **Ajuster les Salaires d'une Entreprise**
    *   **activityType**: `adjust_business_wages`
    *   **Description**: Le gestionnaire se rend à son entreprise (`businessBuildingId`) pour mettre à jour le registre des salaires.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `businessBuildingId`). À l'arrivée, une activité `update_wage_ledger` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newWageAmount`, `strategy`.

17. **Déléguer une Entreprise / Demander ou Prendre une Entreprise pour Soi**
    *   **activityType**: `manage_business_operation`
    *   **Description**: Implique de se rendre au bâtiment de l'entreprise, puis potentiellement de rencontrer les parties concernées ou de se rendre à un `courthouse`/`town_hall` (étude de notaire).
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `businessBuildingId`), puis `goto_location` (vers la partie concernée ou `courthouse`/`town_hall`). À la destination finale, une activité `finalize_operator_change` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newOperatorUsername` (si applicable), `currentOperatorUsername` (si applicable), `ownerUsername` (si applicable), `reason`, `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`), `operationType` ("delegate", "request_management", "claim_management").

## Finance

18. **Demander un Prêt**
    *   **activityType**: `request_loan`
    *   **Description**: Le citoyen se déplace physiquement vers un établissement financier (ex: `broker_s_office`, `mint`) ou rencontre un prêteur connu pour y soumettre une demande de prêt.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `broker_s_office`/`mint` ou localisation du `lenderUsername`). À l'arrivée, une activité de soumission de demande (`activityType: submit_loan_application_form`, durée courte) est créée, dont le processeur appellera `POST /api/loans/apply`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `amount`, `purpose`, `collateralDetails` (optionnel), `targetBuildingId` (optionnel, ID du `broker_s_office`/`mint`), `lenderUsername` (optionnel, pour le déplacement).

19. **Offrir un Prêt**
    *   **activityType**: `offer_loan`
    *   **Description**: Le citoyen se rend à un établissement financier (ex: `broker_s_office`, `mint`) ou à une étude notariale (ex: `courthouse`, `town_hall`) pour y enregistrer une offre de prêt.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `broker_s_office`/`mint` ou `courthouse`/`town_hall`). À l'arrivée, une activité d'enregistrement d'offre de prêt (`activityType: register_loan_offer_terms`, durée courte) est créée, dont le processeur appellera `POST /api/loans`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `targetBorrowerUsername` (optionnel), `amount`, `interestRate`, `termDays`, `targetOfficeBuildingId` (ID de l'établissement pertinent).

20. **Retirer des Jetons COMPUTE**
    *   **activityType**: `withdraw_compute_tokens`
    *   **Description**: Le joueur se rend à un `broker_s_office` ou `mint` (banque/bureau de change) pour initier le retrait.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `broker_s_office` ou `mint`). À l'arrivée, une activité `initiate_token_withdrawal` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `ducatsAmount`, `walletAddress`, `targetBuildingId` (optionnel, ID du `broker_s_office`/`mint`).

21. **Injecter des Jetons COMPUTE**
    *   **activityType**: `inject_compute_tokens`
    *   **Description**: Le joueur se rend à un `broker_s_office` ou `mint` (banque/bureau de change) pour initier l'injection.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `broker_s_office` ou `mint`). À l'arrivée, une activité `initiate_token_injection` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `computeTokenAmount`, `transactionProof`, `targetBuildingId` (optionnel, ID du `broker_s_office`/`mint`).

## Social et Communication

22. **Envoyer un Message**
    *   **activityType**: `send_message`
    *   **Description**: Le citoyen se déplace physiquement vers la dernière position connue du destinataire (`receiverUsername`), son domicile, ou son lieu de travail (`targetBuildingId`) pour lui remettre un message en personne.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetCitizenUsername`: `receiverUsername` ou `targetBuildingId`). Une fois à proximité ou à destination, une activité de remise de message (`activityType: deliver_message_interaction`, durée courte) est créée. Le processeur de cette dernière appellera `POST /api/messages/send` pour enregistrer le message.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `receiverUsername`, `content`, `messageType` (optionnel), `targetBuildingId` (optionnel, lieu de rencontre privilégié comme le domicile ou lieu de travail du destinataire).

23. **Répondre à un Message**
    *   **activityType**: `reply_to_message`
    *   **Description**: Similaire à `send_message`, le citoyen se déplace physiquement vers l'expéditeur original du message (`receiverUsername`) pour lui remettre sa réponse en personne.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetCitizenUsername`: `receiverUsername` ou `targetBuildingId`). Une fois à proximité ou à destination, une activité de remise de réponse (`activityType: deliver_reply_interaction`, durée courte) est créée. Le processeur de cette dernière appellera `POST /api/messages/send`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `originalMessageId`, `receiverUsername` (l'expéditeur du message original), `content`, `messageType` (optionnel), `targetBuildingId` (optionnel, lieu de rencontre privilégié).

24. **Mettre à Jour son Profil Citoyen**
    *   **activityType**: `update_citizen_profile`
    *   **Description**: Le citoyen se rend à son domicile ou à un `public_archives` (bureau public) pour enregistrer les modifications.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile ou `public_archives`). À l'arrivée, une activité `file_profile_update` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `citizenAirtableId`, `firstName`, `lastName`, `familyMotto`, `coatOfArmsImageUrl`, `telegramUserId` (tous optionnels), `targetOfficeBuildingId` (optionnel, ID du `public_archives`).

25. **Gérer son Appartenance à une Guilde**
    *   **activityType**: `manage_guild_membership`
    *   **Description**: Le citoyen se rend au `guild_hall` de la guilde concernée pour effectuer une action liée à son appartenance.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers le `guildHallBuildingId` qui est un `guild_hall`). À l'arrivée, une activité `perform_guild_membership_action` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `guildId`, `membershipAction` ("join", "leave", "accept_invite"), `guildHallBuildingId` (ID du `guild_hall` spécifique).

26. **Générer/Enregistrer une Pensée Stratégique**
    *   **activityType**: `log_strategic_thought`
    *   **Description**: Le citoyen prend un moment pour réfléchir, potentiellement dans un lieu privé (domicile, bureau) ou simplement sur place. La pensée est ensuite enregistrée.
    *   **Mécanisme Principal**: Peut être une activité `ponder_at_location` (courte durée sur place) ou `goto_location` (vers domicile/bureau) suivie de `record_thought`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `context` (optionnel), `visibility`, `ponderLocationBuildingId` (optionnel, ID du lieu de réflexion).

27. **Marquer des Notifications comme Lues**
    *   **activityType**: `mark_notifications_read`
    *   **Description**: Le citoyen prend un moment (à son emplacement actuel ou à son domicile/bureau) pour examiner et marquer ses notifications.
    *   **Mécanisme Principal**: Crée une activité `review_notifications_at_location` (courte durée). Le processeur appellera `POST /api/notifications/mark-read`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `notificationIds`.

## Personnalisation

28. **Télécharger un Blason**
    *   **activityType**: `upload_coat_of_arms`
    *   **Description**: Le joueur se rend à une `art_academy` ou un `bottega` (atelier d'artiste/bureau héraldique) pour faire enregistrer son nouveau blason.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `art_academy` ou `bottega`). À l'arrivée, une activité `submit_coat_of_arms_design` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `imageData` ou `filename`, `targetOfficeBuildingId` (optionnel, ID de l'`art_academy`/`bottega`).

29. **Mettre à Jour les Paramètres Citoyen**
    *   **activityType**: `update_citizen_settings`
    *   **Description**: Le joueur prend un moment (à son emplacement actuel ou à son domicile) pour ajuster ses paramètres personnels.
    *   **Mécanisme Principal**: Crée une activité `access_personal_settings_at_location` (courte durée). Le processeur appellera `POST /api/citizen/settings`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `settingsObject`.
