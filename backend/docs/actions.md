# Actions Stratégiques des Citoyens (en tant qu'Activités)

Ce document détaille les actions stratégiques et économiques que les citoyens peuvent entreprendre dans La Serenissima. Conformément au modèle unifié, **ces "actions" sont initiées en tant qu'"activités" via l'endpoint `POST /api/activities/try-create`**. Chaque action listée ci-dessous correspondra à un `activityType` spécifique.

L'initiation via `try-create` permettra au moteur Python de déterminer la séquence d'activités nécessaire. Par exemple, une action `bid_on_land` pourrait d'abord générer une activité `goto_citizen` pour se rendre auprès du vendeur ou d'un notaire, avant que l'enchère elle-même ne soit traitée. Chaque étape pertinente de ce processus aura un enregistrement dans la table `ACTIVITIES`.

Les `Type` listés ci-dessous sont les `activityType` à utiliser avec `POST /api/activities/try-create`. Les `actionParameters` (qui deviendront `activityParameters` dans le corps de la requête à `/api/activities/try-create`) pour cet endpoint devront contenir les informations spécifiques à chaque action.

## Gestion Foncière et Immobilière

1.  **Faire une Offre sur un Terrain**
    *   **activityType**: `bid_on_land`
    *   **Description**: Le citoyen se rend à un lieu désigné (ex: étude de notaire, bureau des enchères) pour soumettre une offre sur une parcelle de terrain. L'offre est enregistrée une fois sur place.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers un bâtiment de type "notary_office" ou "auction_house"). À l'arrivée, une activité `submit_land_bid` est créée, dont le processeur appellera `POST /api/contracts` pour enregistrer l'enchère.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `bidAmount`, `targetBuildingId` (optionnel, ID du bureau de notaire/enchères).

2.  **Acheter un Terrain Disponible**
    *   **activityType**: `buy_available_land`
    *   **Description**: Le citoyen se rend à un lieu désigné (ex: étude de notaire) pour finaliser l'achat direct d'une parcelle de terrain. La transaction est effectuée une fois sur place.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers un "notary_office"). À l'arrivée, une activité `finalize_land_purchase` est créée, dont le processeur gérera la vérification des fonds et le transfert de propriété (potentiellement via un appel interne à un service de transaction).
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `expectedPrice`, `targetBuildingId` (optionnel, ID du bureau de notaire).

3.  **Initier un Projet de Construction de Bâtiment**
    *   **activityType**: `initiate_building_project`
    *   **Description**: Le citoyen se rend sur le terrain (`landId`), puis potentiellement à un bureau d'urbanisme ou à l'atelier d'un constructeur pour soumettre les plans et lancer le projet.
    *   **Mécanisme Principal**: Séquence d'activités : `goto_land_plot` (pour inspection), puis `goto_location` (vers "planning_office" ou atelier du constructeur si `builderContractDetails` fourni). À la destination finale, une activité `submit_building_project` est créée, dont le processeur utilisera la logique de `/api/create-building-at-point` et `/api/actions/construct-building`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `buildingTypeDefinition`, `pointDetails`, `builderContractDetails` (optionnel), `targetOfficeBuildingId` (optionnel, ID du bureau d'urbanisme/constructeur).

4.  **Ajuster le Prix de Location d'un Terrain**
    *   **activityType**: `adjust_land_lease_price`
    *   **Description**: Le propriétaire foncier se rend à son domicile, à un bureau qu'il gère, ou à un bureau public (ex: cadastre) pour enregistrer la modification du bail.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou "records_office"). À l'arrivée, une activité `file_lease_adjustment` est créée, dont le processeur mettra à jour le `LeasePrice`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId` ou `landId`, `newLeasePrice`, `strategy`, `targetOfficeBuildingId` (optionnel, ID du bureau pertinent).

5.  **Ajuster le Prix de Loyer d'un Bâtiment**
    *   **activityType**: `adjust_building_rent_price`
    *   **Description**: Le propriétaire du bâtiment se rend à son domicile, bureau, ou un bureau public pour enregistrer la modification du loyer.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou "records_office"). À l'arrivée, une activité `file_rent_adjustment` est créée, dont le processeur mettra à jour le `RentPrice`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId`, `newRentPrice`, `strategy`, `targetOfficeBuildingId` (optionnel).

## Commerce et Contrats

6.  **Créer/Modifier un Contrat de Vente Publique**
    *   **activityType**: `manage_public_sell_contract`
    *   **Description**: Le citoyen se rend à son bâtiment de vente (`sellerBuildingId`) pour vérifier/préparer les marchandises, puis potentiellement à un bureau de marché pour enregistrer/modifier l'offre.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `sellerBuildingId`), puis optionnellement `goto_location` (vers "market_office"). À la destination finale, une activité `register_sell_contract` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `pricePerResource`, `targetAmount`, `sellerBuildingId`, `targetOfficeBuildingId` (optionnel, ID du bureau de marché).

7.  **Modifier le Prix d'une Vente Publique**
    *   **activityType**: `modify_public_sell_price` (Note: `manage_public_sell_contract` est préféré.)
    *   **Description**: Le citoyen se rend à son bâtiment de vente ou à un bureau de marché pour ajuster le prix d'un contrat existant.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `sellerBuildingId` ou "market_office"). À l'arrivée, une activité `update_sell_contract_price` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `newPricePerResource`, `targetOfficeBuildingId` (optionnel).

8.  **Terminer un Contrat de Vente Publique**
    *   **activityType**: `end_public_sell_contract`
    *   **Description**: Le citoyen se rend à son bâtiment de vente ou à un bureau de marché pour retirer une offre de vente.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `sellerBuildingId` ou "market_office"). À l'arrivée, une activité `terminate_sell_contract` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `targetOfficeBuildingId` (optionnel).

9.  **Créer/Modifier un Contrat d'Importation**
    *   **activityType**: `manage_import_contract`
    *   **Description**: Le citoyen se rend à son bâtiment d'achat (`buyerBuildingId`) pour évaluer ses besoins, puis potentiellement à un bureau de commerce pour enregistrer/modifier le contrat.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `buyerBuildingId`), puis optionnellement `goto_location` (vers "trade_office"). À la destination finale, une activité `register_import_contract` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `pricePerResource`, `buyerBuildingId`, `targetOfficeBuildingId` (optionnel, ID du bureau de commerce).

10. **Créer/Modifier une Offre de Stockage Public**
    *   **activityType**: `manage_public_storage_offer`
    *   **Description**: Le citoyen se rend à son bâtiment de stockage (`sellerBuildingId`) pour évaluer la capacité disponible, puis enregistre/modifie l'offre.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `sellerBuildingId`). À l'arrivée, une activité `register_storage_offer` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `sellerBuildingId`, `resourceType`, `capacityOffered`, `pricePerUnitPerDay`, `pricingStrategy`.

11. **Faire une Offre d'Achat sur un Bâtiment Existant**
    *   **activityType**: `bid_on_building`
    *   **Description**: Le citoyen se rend au bâtiment cible pour l'inspecter, puis se rend à une étude de notaire ou rencontre le propriétaire pour soumettre son offre.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `buildingIdToBidOn`), puis `goto_location` (vers "notary_office" ou la localisation du `targetOwnerUsername`). À la destination finale, une activité `submit_building_bid_offer` est créée, dont le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingIdToBidOn`, `bidAmount`, `targetOwnerUsername` (optionnel), `targetOfficeBuildingId` (optionnel, ID du notaire).

12. **Accepter/Refuser une Offre sur un Bâtiment Possédé**
    *   **activityType**: `respond_to_building_bid`
    *   **Description**: Le propriétaire se rend à une étude de notaire ou rencontre l'enchérisseur pour communiquer sa décision.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers "notary_office" ou la localisation du `bidderUsername`). À l'arrivée, une activité `process_building_bid_response` est créée, dont le processeur mettra à jour le contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `response`, `bidderUsername` (optionnel), `targetOfficeBuildingId` (optionnel, ID du notaire).

13. **Retirer une Offre d'Achat sur un Bâtiment**
    *   **activityType**: `withdraw_building_bid`
    *   **Description**: L'enchérisseur se rend à une étude de notaire ou rencontre le propriétaire pour retirer son offre.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers "notary_office" ou la localisation du `targetOwnerUsername`). À l'arrivée, une activité `process_bid_withdrawal` est créée, dont le processeur mettra à jour le contrat via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `targetOwnerUsername` (optionnel), `targetOfficeBuildingId` (optionnel, ID du notaire).

14. **Créer/Gérer un Contrat d'Achat avec Majoration (Markup Buy Contract)**
    *   **activityType**: `manage_markup_buy_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer un besoin urgent, puis potentiellement à un bureau de marché pour enregistrer le contrat.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `buyerBuildingId`), puis optionnellement `goto_location` (vers "market_office"). À la destination finale, une activité `register_markup_buy_contract` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `maxPricePerResource`, `buyerBuildingId`, `targetOfficeBuildingId` (optionnel).

15. **Créer/Gérer un Contrat de Demande de Stockage (Storage Query Contract)**
    *   **activityType**: `manage_storage_query_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer ses besoins de stockage, puis potentiellement à un bureau de marché.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `buyerBuildingId`), puis optionnellement `goto_location` (vers "market_office"). À la destination finale, une activité `register_storage_query_contract` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `amountNeeded`, `durationDays`, `buyerBuildingId`, `targetOfficeBuildingId` (optionnel).

## Gestion du Travail et des Entreprises

16. **Ajuster les Salaires d'une Entreprise**
    *   **activityType**: `adjust_business_wages`
    *   **Description**: Le gestionnaire se rend à son entreprise (`businessBuildingId`) pour mettre à jour le registre des salaires.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `businessBuildingId`). À l'arrivée, une activité `update_wage_ledger` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newWageAmount`, `strategy`.

17. **Déléguer une Entreprise / Demander ou Prendre une Entreprise pour Soi**
    *   **activityType**: `manage_business_operation`
    *   **Description**: Implique de se rendre au bâtiment de l'entreprise, puis potentiellement de rencontrer les parties concernées (opérateur actuel, propriétaire, nouvel opérateur) ou de se rendre à une étude de notaire.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `businessBuildingId`), puis `goto_location` (vers la partie concernée ou "notary_office"). À la destination finale, une activité `finalize_operator_change` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newOperatorUsername` (si applicable), `currentOperatorUsername` (si applicable), `ownerUsername` (si applicable), `reason`, `targetOfficeBuildingId` (optionnel, ID du notaire), `operationType` ("delegate", "request_management", "claim_management").

## Finance

18. **Demander un Prêt**
    *   **activityType**: `request_loan`
    *   **Description**: Le citoyen se rend à une banque ou rencontre un prêteur connu pour soumettre sa demande de prêt.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers un bâtiment de type "bank" ou la localisation du `lenderUsername`). À l'arrivée, une activité `submit_loan_application` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `amount`, `purpose`, `collateralDetails` (optionnel), `targetBuildingId` (optionnel, ID de la banque), `lenderUsername` (optionnel).

19. **Offrir un Prêt**
    *   **activityType**: `offer_loan`
    *   **Description**: Le citoyen se rend à son domicile, bureau, ou à une banque/étude de notaire pour enregistrer une offre de prêt.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau, "bank", ou "notary_office"). À l'arrivée, une activité `register_loan_offer` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `targetBorrowerUsername` (optionnel), `amount`, `interestRate`, `termDays`, `targetOfficeBuildingId` (optionnel).

20. **Retirer des Jetons COMPUTE**
    *   **activityType**: `withdraw_compute_tokens`
    *   **Description**: Le joueur se rend à un bâtiment de type "bank" ou "exchange" pour initier le retrait.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers "bank" ou "exchange"). À l'arrivée, une activité `initiate_token_withdrawal` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `ducatsAmount`, `walletAddress`, `targetBuildingId` (optionnel, ID de la banque/exchange).

21. **Injecter des Jetons COMPUTE**
    *   **activityType**: `inject_compute_tokens`
    *   **Description**: Le joueur se rend à un bâtiment de type "bank" ou "exchange" pour initier l'injection.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers "bank" ou "exchange"). À l'arrivée, une activité `initiate_token_injection` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `computeTokenAmount`, `transactionProof`, `targetBuildingId` (optionnel, ID de la banque/exchange).

## Social et Communication

22. **Envoyer un Message**
    *   **activityType**: `send_message`
    *   **Description**: Le citoyen se déplace vers la dernière position connue du destinataire (ou son domicile/lieu de travail) pour "livrer" le message.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers la position du `receiverUsername` ou un `targetBuildingId` associé). À l'arrivée, une activité `deliver_message_in_person` est créée, dont le processeur appellera `POST /api/messages/send`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `receiverUsername`, `content`, `messageType` (optionnel), `targetBuildingId` (optionnel, ex: domicile du destinataire).

23. **Répondre à un Message**
    *   **activityType**: `reply_to_message`
    *   **Description**: Similaire à `send_message`, le citoyen se déplace vers l'expéditeur original pour livrer sa réponse.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers la position du `receiverUsername` - l'expéditeur original). À l'arrivée, une activité `deliver_reply_in_person` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `originalMessageId`, `receiverUsername` (expéditeur original), `content`, `messageType` (optionnel), `targetBuildingId` (optionnel).

24. **Mettre à Jour son Profil Citoyen**
    *   **activityType**: `update_citizen_profile`
    *   **Description**: Le citoyen se rend à son domicile ou à un bureau public (ex: archives) pour enregistrer les modifications de son profil.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile ou "records_office"). À l'arrivée, une activité `file_profile_update` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `citizenAirtableId`, `firstName`, `lastName`, `familyMotto`, `coatOfArmsImageUrl`, `telegramUserId` (tous optionnels), `targetOfficeBuildingId` (optionnel).

25. **Gérer son Appartenance à une Guilde**
    *   **activityType**: `manage_guild_membership`
    *   **Description**: Le citoyen se rend au bâtiment de la guilde (`GuildHallId`) pour effectuer une action liée à son appartenance.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers le `guildHallBuildingId` dérivé de `guildId`). À l'arrivée, une activité `perform_guild_membership_action` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `guildId`, `membershipAction` ("join", "leave", "accept_invite"), `guildHallBuildingId` (optionnel, peut être dérivé).

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
    *   **Description**: Le joueur se rend à un bureau héraldique ou un atelier d'artiste pour faire enregistrer son nouveau blason.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers "herald_office" ou "artisan_workshop"). À l'arrivée, une activité `submit_coat_of_arms_design` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `imageData` ou `filename`, `targetOfficeBuildingId` (optionnel, ID du bureau/atelier).

29. **Mettre à Jour les Paramètres Citoyen**
    *   **activityType**: `update_citizen_settings`
    *   **Description**: Le joueur prend un moment (à son emplacement actuel ou à son domicile) pour ajuster ses paramètres personnels.
    *   **Mécanisme Principal**: Crée une activité `access_personal_settings_at_location` (courte durée). Le processeur appellera `POST /api/citizen/settings`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `settingsObject`.
