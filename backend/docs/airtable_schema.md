# Schéma des Tables Airtable (Inféré)

Ce document décrit la structure probable des tables Airtable utilisées dans La Serenissima. Les champs non-listés ici n'existent pas. Les noms de champs sont sensibles à la casse.

**Note sur les Réponses API :**
Les descriptions de tables ci-dessous représentent le schéma brut dans Airtable. Cependant, de nombreux points d'accès API (par exemple, `/api/lands`, `/api/buildings`, `/api/resources`, `/api/contracts`) enrichissent ces données. Ils peuvent :
-   Fusionner des informations provenant d'autres sources (ex: données géométriques de `/api/get-polygons` pour les terrains, définitions de `/api/building-types` pour les bâtiments, ou `/api/resource-types` pour les ressources et contrats).
-   Transformer les noms de champs (ex: de PascalCase à camelCase).
-   Calculer de nouveaux champs qui ne sont pas stockés directement dans Airtable.
Consultez la documentation ou le code source des points d'accès API spécifiques pour comprendre la structure exacte des données retournées.

## Table: CITIZENS

Contient les informations sur tous les citoyens (IA et humains).

-   `CitizenId` (Texte): Identifiant personnalisé unique (EST EGAL au Username!).
-   `Username` (Texte): Nom d'utilisateur unique. (Identifiant principal des CITIZENS)
-   `FirstName` (Texte): Prénom.
-   `LastName` (Texte): Nom de famille.
-   `SocialClass` (Texte): Classe sociale (ex: `Nobili`, `Cittadini`, `Popolani`, `Facchini`, `Forestieri`).
-   `Ducats` (Nombre): Monnaie du citoyen.
-   `IsAI` (Case à cocher/Nombre): Indique si le citoyen est une IA (1 pour vrai).
-   `InVenice` (Case à cocher/Nombre): Indique si le citoyen est actuellement à Venise (1 pour vrai).
-   `Position` (Texte multiligne): Chaîne JSON des coordonnées (ex: `{"lat": 45.43, "lng": 12.33}`). -> Doit être parsé par le front-end
-   `Point` (Texte): Identifiant du point spécifique sur un polygone (ex: `building_lat_lng_index`).
-   `HomeCity` (Texte): Ville d'origine (pour les `Forestieri`).
-   `AteAt` (Date/Heure): Horodatage ISO du dernier repas. (Venice time)
-   `Description` (Texte multiligne): Description de la personnalité.
-   `CorePersonality` (Texte multiligne): Chaîne JSON des 3 traits de personnalité principaux (Strength, Flaw, Drive).
-   `ImagePrompt` (Texte multiligne): Prompt utilisé pour générer l'image du citoyen.
-   `ImageUrl` (URL): URL de l'image du citoyen.
-   `LastActiveAt` (Date/Heure): Horodatage de la dernière activité. (Venice time)
-   `CoatOfArmsImageUrl` (URL): URL de l'image du blason.
-   `Color` (Texte): Couleur principale associée au citoyen.
-   `SecondaryColor` (Texte): Couleur secondaire associée au citoyen.
-   `GuildId` (Texte): ID de la guilde à laquelle le citoyen appartient.
-   `Preferences` (Texte multiligne): Chaîne JSON des préférences du citoyen.
-   `FamilyMotto` (Texte): Devise familiale.
-   `CoatOfArms` (Pièce jointe/URL): Blason.
-   `Wallet` (Texte): Adresse du portefeuille (pour les joueurs humains).
-   `TelegramUserId` (Nombre): ID utilisateur Telegram du citoyen (si fourni).
-   `DailyIncome` (Nombre): Revenu calculé sur les dernières 24h.
-   `DailyTurnover` (Nombre): Dépenses calculées sur les dernières 24h.
-   `WeeklyIncome` (Nombre): Revenu calculé sur les 7 derniers jours.
-   `WeeklyTurnover` (Nombre): Dépenses calculées sur les 7 derniers jours.
-   `MonthlyIncome` (Nombre): Revenu calculé sur les 30 derniers jours.
-   `MonthlyTurnover` (Nombre): Dépenses calculées sur les 30 derniers jours.
-   `Influence` (Nombre): Score d'influence.
-   `CarryCapacityOverride` (Nombre): Capacité de transport personnalisée. Si vide, la valeur par défaut du système est utilisée.
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: BUILDINGS

Contient les informations sur tous les bâtiments.

-   `BuildingId` (Texte): Identifiant personnalisé unique (souvent dérivé de `Point` ou `Type_lat_lng`).
-   `Name` (Texte): Nom descriptif du bâtiment (ex: "Atelier de Tisserand à Rio Terà dei Assassini"). Calculé à la création.
-   `Type` (Texte): Type de bâtiment (ex: `canal_house`, `armory`, `merchant_galley`). Le nom lisible du bâtiment est généralement dérivé de ce champ par le client (ex: "Canal House") ou de la définition du type de bâtiment.
-   `Category` (Texte): Catégorie du bâtiment (ex: `home`, `business`, `transport`).
-   `SubCategory` (Texte): Sous-catégorie du bâtiment.
-   `LandId` (Texte): Identifiant personnalisé du terrain (`LANDS`) sur lequel le bâtiment est construit.
-   `Position` (Texte multiligne): Chaîne JSON des coordonnées du point principal du bâtiment (ex: `{"lat": 45.43, "lng": 12.33}`). -> Doit être parsé par le front-end
-   `Point` (Texte): Identifiant du point spécifique sur un polygone (ex: `building_lat_lng_index`) pour les bâtiments de taille 1. Pour les bâtiments de taille supérieure à 1, ce champ contient une chaîne JSON représentant une liste d'identifiants de points (ex: `["main_point_id", "additional_point_1", ...]`), où le premier point est le principal.
-   `Rotation` (Nombre): Rotation du bâtiment en radians.
-   `Owner` (Lien vers `CITIZENS` via `Username`): Propriétaire du bâtiment.
-   `RunBy` (Lien vers `CITIZENS` via `Username`): Opérateur/gestionnaire du bâtiment.
-   `Occupant` (Lien vers `CITIZENS` via `Username`): Occupant actuel (travailleur ou résident).
-   `LeasePrice` (Nombre): Loyer payé au propriétaire du terrain.
-   `RentPrice` (Nombre): Loyer payé par l'occupant/opérateur au propriétaire du bâtiment.
-   `Wages` (Nombre): Salaires offerts par ce bâtiment s'il s'agit d'une entreprise.
-   `IsConstructed` (Case à cocher/Nombre): Indique si la construction est terminée (1 pour vrai, 0 pour faux). Par défaut, si non défini, considéré comme construit. Un bâtiment nouvellement placé via l'interface utilisateur commencera avec cette valeur à 0.
-   `ConstructionDate` (Date/Heure): Date de fin de construction ou d'arrivée (pour les galères).
-   `ConstructionMinutesRemaining` (Nombre): Nombre de minutes de construction restantes avant que le bâtiment ne soit terminé. Initialisé à partir de `constructionMinutes` de la définition JSON du type de bâtiment. Décrémenté par les activités `construct_building`.
-   `Variant` (Texte): Variante du modèle 3D (ex: `model`).
-   `Notes` (Texte multiligne): Notes diverses.
-   `CheckedAt` (Date/Heure): Horodatage de la dernière activité opérationnelle significative enregistrée pour ce bâtiment par son opérateur (`RunBy`). Ce champ est automatiquement mis à jour lorsque le citoyen `RunBy` effectue certaines activités liées à la gestion du bâtiment (par exemple, en arrivant au travail via `goto_work`, en lançant une `production`, ou via une activité dédiée comme `check_business_status` si implémentée). Si ce champ n'est pas mis à jour pendant plus de 24 heures, cela indique un manque de supervision active simulée, entraînant une pénalité de productivité de 50% pour le bâtiment.
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: RESOURCES

Stocke les instances de ressources et leur emplacement.

-   `ResourceId` (Texte): Identifiant personnalisé unique (ex: `resource-uuid`).
-   `Type` (Texte): Type de ressource (ex: `timber`, `bread`, `iron_ore`). Fait référence à l'ID dans les définitions de ressources.
-   `Name` (Texte): Nom lisible de la ressource.
-   `Asset` (Texte): Identifiant personnalisé de l'entité qui détient cette ressource (ex: `BuildingId` d'un bâtiment, `Username` d'un citoyen).
-   `AssetType` (Texte): Type de l'entité détentrice (ex: `building`, `citizen`).
-   `Owner` (Lien vers `CITIZENS` via `Username`): Propriétaire de cette pile de ressources.
-   `Count` (Nombre): Quantité de cette ressource.
-   `Position` (Texte multiligne): Chaîne JSON des coordonnées de la ressource (ex: `{"lat": 45.43, "lng": 12.33}`). Utilisé si la ressource n'est pas directement dans un bâtiment ou sur un citoyen, ou pour surcharger leur position.
-   `ConsumedAt` (Date/Heure): Horodatage ISO de la dernière consommation (pour la production).
-   `Notes` (Texte multiligne): Notes diverses (ex: contrat d'origine pour les biens importés).
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: CONTRACTS

Gère les accords commerciaux entre citoyens ou avec le public.

-   `ContractId` (Texte): Identifiant personnalisé unique, souvent déterministe (ex: `contract-import-bld_xxx-timber`, `building_bid_BUILDINGID_BUYERNAME_TIMESTAMP`).
-   `Type` (Texte): Type de contrat (ex: `import`, `public_sell`, `recurrent`, `construction_project`, `logistics_service_request`, `building_bid`).
-   `Buyer` (Lien vers `CITIZENS` via `Username`): Acheteur. Peut être "public" pour les ventes publiques. Pour `construction_project`, c'est le commanditaire de la construction. Pour `logistics_service_request`, c'est le client. Pour `building_bid`, c'est le citoyen qui place l'offre.
-   `Seller` (Lien vers `CITIZENS` via `Username`): Vendeur. Peut être un système (ex: "Italia" pour les importations). Pour `logistics_service_request`, c'est l'opérateur du Porter Guild Hall.
-   `ResourceType` (Texte): Type de ressource concernée. Pour `logistics_service_request`, ce champ peut être vide. Pour `public_storage`, c'est le type de ressource stockée.
-   `ServiceFeePerUnit` (Nombre): Utilisé par `logistics_service_request` pour définir le coût du service de portage par unité de ressource livrée. Non utilisé pour `public_storage`.
-   `Transporter` (Lien vers `CITIZENS` via `Username`): Citoyen assigné au transport (si applicable).
-   `BuyerBuilding` (Texte): `BuildingId` personnalisé du bâtiment de l'acheteur. Pour `construction_project`, c'est le `BuildingId` du bâtiment en cours de construction. Pour `logistics_service_request`, c'est le bâtiment de destination du client. Non applicable pour `public_storage`.
-   `SellerBuilding` (Texte): `BuildingId` personnalisé du bâtiment du vendeur. Pour `construction_project`, c'est l'atelier de construction. Pour `logistics_service_request`, c'est le Porter Guild Hall. Pour `public_storage`, c'est le bâtiment offrant le stockage. Pour `building_bid`, ce champ peut être non pertinent ou stocker le `BuildingId` de l'actif (redondant avec `Asset`).
-   `Title` (Texte): Un titre accrocheur pour le contrat, visible par les acheteurs potentiels (surtout pour `public_sell` et `public_storage`). Pour `building_bid`, pourrait être "Bid for [Building Name]".
-   `Description` (Texte multiligne): Une description plus détaillée du service ou du bien offert par le contrat.
-   `TargetAmount` (Nombre): Quantité totale de ressource pour ce contrat (ex: pour `import`, `public_sell`) ou quantité par transaction (ex: pour `recurrent`). Pour `logistics_service_request`, peut représenter un volume total de service. Pour `building_bid`, généralement 1.
-   `PricePerResource` (Nombre): Prix unitaire de la ressource. Pour `public_storage`, ce champ stocke le taux de la commission de stockage. Pour `building_bid`, c'est le montant total de l'offre pour le bâtiment.
-   `Priority` (Nombre): Priorité du contrat.
-   `Status` (Texte): Statut du contrat (ex: `active`, `completed`, `failed`, `ended_by_ai`). Pour `building_bid`, peut être `active` (offre ouverte), `accepted` (offre acceptée par le propriétaire), `refused` (offre refusée), `withdrawn` (offre retirée par l'enchérisseur).
-   `Notes` (Texte multiligne): Chaîne JSON ou texte pour des détails supplémentaires. Pour `building_bid`, peut contenir des conditions ou messages de l'enchérisseur.
-   `Asset` (Texte): (Nouveau/Utilisation étendue) Pour `building_bid`, stocke le `BuildingId` du bâtiment concerné par l'offre.
-   `AssetType` (Texte): (Nouveau/Utilisation étendue) Pour `building_bid`, stocke la valeur `'building'`.
-   `LastExecutedAt` (Date/Heure): Horodatage de la dernière exécution partielle (ex: pour `fetch_from_galley`).
-   `CreatedAt` (Date/Heure): Date de création du contrat.
-   `EndAt` (Date/Heure): Date de fin de validité du contrat. Pour `building_bid`, peut être la date d'expiration de l'offre.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: ACTIVITIES

Suit les actions en cours et terminées des citoyens.

-   `ActivityId` (Texte): Identifiant personnalisé unique (ex: `goto_work_username_timestamp`).
-   `Type` (Texte): Type d'activité (ex: `rest`, `goto_home`, `production`, `deliver_resource_batch`, `fetch_resource`, `secure_warehouse`, `deliver_to_storage`, `fetch_from_storage`, `goto_building_for_storage_fetch`, `check_business_status`).
-   `Citizen` (Lien vers `CITIZENS` via `Username`): Citoyen effectuant l'activité.
-   `FromBuilding` (Texte): `BuildingId` personnalisé du lieu de départ/actuel.
-   `ToBuilding` (Texte): `BuildingId` personnalisé de la destination.
-   `ContractId` (Texte): `ContractId` personnalisé ou ID d'enregistrement Airtable du contrat lié (pour `fetch_resource`, `fetch_from_galley`, `deliver_resource_batch`, `deliver_to_storage`, `fetch_from_storage`).
-   `ResourceId` (Texte): (Obsolète pour `fetch_resource`. Pour `eat_from_inventory` et `eat_at_home`, l'information est dans `Notes`. Pour `fetch_for_logistics_client`, dans `Details`.) Type de ressource impliquée.
-   `Amount` (Nombre): (Obsolète pour `fetch_resource`. Pour `eat_from_inventory` et `eat_at_home`, l'information est dans `Notes`. Pour `fetch_for_logistics_client`, dans `Details`.) Quantité de ressource impliquée.
-   `Resources` (Texte multiligne): Chaîne JSON d'un tableau d'objets `{"ResourceId": ..., "Amount": ...}` pour les livraisons groupées (ex: `deliver_resource_batch`, `fetch_from_galley`, `deliver_to_storage`, `fetch_from_storage`).
-   `TransportMode` (Texte): Mode de transport (ex: `walk`, `gondola`, `merchant_galley`).
-   `Path` (Texte multiligne): Chaîne JSON d'un tableau de coordonnées pour le trajet.
-   `Transporter` (Lien vers `CITIZENS` via `Username`): Citoyen responsable du transport (ex: opérateur de la gondole).
-   `Status` (Texte): Statut de l'activité (ex: `created`, `processed`, `failed`).
-   `Notes` (Texte multiligne): Notes diverses.
-   `Details` (Texte multiligne): Chaîne JSON pour des données structurées additionnelles, utilisées par certains types d'activités pour passer des informations à des processeurs ultérieurs (ex: `goto_building_for_storage_fetch` stocke ici les infos pour l'activité `fetch_from_storage` qui suivra).
-   `Priority` (Nombre): Priorité de l'activité.
-   `CreatedAt` (Date/Heure): Date de création de l'activité.
-   `StartDate` (Date/Heure): Date de début de l'activité.
-   `EndDate` (Date/Heure): Date de fin de l'activité.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: LANDS

Informations sur les parcelles de terrain.

-   `LandId` (Texte): Identifiant personnalisé unique (ex: `polygon-timestamp`).
-   `HistoricalName` (Texte): Nom historique de la parcelle.
-   `EnglishName` (Texte): Nom anglais de la parcelle.
-   `Owner` (Lien vers `CITIZENS` via `Username`): Propriétaire du terrain.
-   `LastIncome` (Nombre): Dernier revenu enregistré pour ce terrain (utilisé pour les enchères IA).
-   `BuildingPointsCount` (Nombre): Nombre de points de construction disponibles.
-   `District` (Texte): Quartier où se situe le terrain.

## Table: NOTIFICATIONS

Messages et alertes pour les citoyens et les administrateurs.

-   `Citizen` (Lien vers `CITIZENS` via `Username`): Destinataire de la notification.
-   `Type` (Texte): Type de notification (ex: `rent_change`, `wage_adjustment_automated`, `admin_report_...`).
-   `Content` (Texte multiligne): Contenu principal du message.
-   `Details` (Texte multiligne): Chaîne JSON pour des données structurées additionnelles.
-   `Asset` (Texte): ID de l'entité liée (ex: `BuildingId`, `ContractId`, "system_report").
-   `AssetType` (Texte): Type de l'entité liée (ex: `building`, `contract`, `report`).
-   `Notes` (Texte multiligne): Notes diverses.
-   `ReadAt` (Date/Heure): Horodatage de lecture (null si non lue).
-   `Status` (Texte): Statut de la notification (ex: `unread`, `read`, `archived`).
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: TRANSACTIONS

Enregistrement exaustif des échanges financiers.

-   `Type` (Texte): Type de transaction (ex: `wage_payment`, `rent_payment`, `resource_purchase_on_fetch`).
-   `AssetType` (Texte): Type de l'actif lié (ex: `building`, `contract`, `resource`).
-   `Asset` (Texte): `BuildingId` personnalisé, `ContractId` personnalisé, ou `ResourceId` de l'actif lié.
-   `Seller` (Lien vers `CITIZENS` via `Username`): Vendeur/Payeur.
-   `Buyer` (Lien vers `CITIZENS` via `Username`): Acheteur/Receveur.
-   `Price` (Nombre): Montant en Ducats de la transaction.
-   `Notes` (Texte multiligne): Chaîne JSON ou texte pour des détails.
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `ExecutedAt` (Date/Heure): Date d'exécution effective de la transaction.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: PROBLEMS

Suivi des problèmes rencontrés par les citoyens ou les systèmes.

-   `Citizen` (Lien vers `CITIZENS` via `Username`): Citoyen concerné ou rapporteur.
-   `AssetType` (Texte): Type de l'actif lié (ex: `building`, `resource`, `citizen`).
-   `Asset` (Texte): `BuildingId` personnalisé, `ResourceId`, ou `CitizenId` de l'actif lié.
-   `Type` (Texte): Catégorie du problème (ex: `homeless_citizen`, `building_vacant`).
-   `Description` (Texte multiligne): Description détaillée du problème.
-   `Status` (Texte): Statut (ex: `active`, `resolved`).
-   `Severity` (Nombre/Texte): Niveau de gravité.
-   `Position` (Texte multiligne): Chaîne JSON des coordonnées (ex: `{"lat": 45.43, "lng": 12.33}`).
-   `Location` (Texte): Description textuelle du lieu du problème.
-   `Title` (Texte): Titre concis du problème.
-   `Solutions` (Texte multiligne): Suggestions de solutions ou actions entreprises.
-   `Notes` (Texte multiligne): Notes additionnelles sur le problème.
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `ResolvedAt` (Date/Heure): Date de résolution.
-   `UpdatedAt` (Date/Heure): Date de dernière modification (automatique par Airtable).

## Table: DECREES

Décrets et lois promulgués.

-   `DecreeId` (Texte): Identifiant unique du décret.
-   `Type` (Texte): Type de décret (ex: `tax_change`, `building_restriction`).
-   `Title` (Texte): Titre officiel du décret.
-   `Description` (Texte multiligne): Description complète du décret.
-   `Rationale` (Texte multiligne): Justification ou raison d'être du décret.
-   `Status` (Texte): Statut actuel (ex: `proposed`, `active`, `repealed`, `expired`).
-   `Category` (Texte): Catégorie générale (ex: `economic`, `social`, `military`).
-   `SubCategory` (Texte): Sous-catégorie plus spécifique.
-   `Proposer` (Lien vers `CITIZENS` via `Username`): Citoyen ou entité ayant proposé le décret.
-   `FlavorText` (Texte multiligne): Texte d'ambiance ou citation.
-   `HistoricalInspiration` (Texte multiligne): Inspiration historique ou contexte.
-   `Notes` (Texte multiligne): Notes administratives ou commentaires.
-   `CreatedAt` (Date/Heure): Date de proposition ou de création de l'enregistrement.
-   `EnactedAt` (Date/Heure): Date à laquelle le décret prend effet.
-   `ExpiresAt` (Date/Heure): Date d'expiration du décret (si applicable).
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Table: GUILDS

Informations sur les guildes de la ville.

-   `GuildId` (Texte): Identifiant unique de la guilde.
-   `GuildName` (Texte): Nom officiel de la guilde.
-   `CreatedAt` (Date/Heure): Date de fondation de la guilde.
-   `PrimaryLocation` (Lien vers `BUILDINGS` via `BuildingId`): Siège principal ou lieu de réunion.
-   `ShortDescription` (Texte): Description courte de la guilde.
-   `Description` (Texte multiligne): Description détaillée, objectifs, histoire.
-   `PatronSaint` (Texte): Saint patron de la guilde.
-   `GuildTier` (Nombre): Niveau ou prestige de la guilde.
-   `LeadershipStructure` (Texte multiligne): Description de la hiérarchie.
-   `EntryFee` (Nombre): Coût en Ducats pour rejoindre la guilde.
-   `VotingSystem` (Texte): Description du système de vote interne.
-   `MeetingFrequency` (Texte): Fréquence des réunions (ex: `weekly`, `monthly`).
-   `GuildHallId` (Lien vers `BUILDINGS` via `BuildingId`): ID du bâtiment servant de quartier général.
-   `GuildEmblem` (Pièce jointe/URL): Emblème de la guilde.
-   `GuildBanner` (Pièce jointe/URL): Bannière de la guilde.
-   `Color` (Texte): Couleur principale de la guilde.
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Table: LOANS

Enregistrements des prêts entre citoyens ou institutions.

-   `LoanId` (Texte): Identifiant unique du prêt.
-   `Name` (Texte): Nom ou description du prêt.
-   `Lender` (Lien vers `CITIZENS` via `Username`): Citoyen ou entité qui prête l'argent.
-   `Borrower` (Lien vers `CITIZENS` via `Username`): Citoyen ou entité qui emprunte l'argent.
-   `Type` (Texte): Type de prêt (ex: `personal`, `business`, `mortgage`).
-   `Status` (Texte): Statut du prêt (ex: `pending_approval`, `active`, `paid_off`, `defaulted`).
-   `PrincipalAmount` (Nombre): Montant initial du prêt en Ducats.
-   `InterestRate` (Nombre): Taux d'intérêt (ex: 0.05 pour 5%).
-   `TermDays` (Nombre): Durée du prêt en jours.
-   `PaymentAmount` (Nombre): Montant du paiement régulier (si applicable).
-   `RemainingBalance` (Nombre): Solde restant dû.
-   `ApplicationText` (Texte multiligne): Texte de la demande de prêt.
-   `LoanPurpose` (Texte multiligne): Raison de l'emprunt.
-   `Notes` (Texte multiligne): Notes diverses sur le prêt.
-   `TemplateId` (Texte): Identifiant d'un modèle de prêt (si applicable).
-   `CreatedAt` (Date/Heure): Date de création de la demande de prêt.
-   `ApprovedAt` (Date/Heure): Date d'approbation du prêt.
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Table: MESSAGES

Communications entre citoyens.

-   `MessageId` (Texte): Identifiant unique du message.
-   `Sender` (Lien vers `CITIZENS` via `Username`): Expéditeur du message.
-   `Receiver` (Lien vers `CITIZENS` via `Username`): Destinataire du message.
-   `Content` (Texte multiligne): Contenu du message.
-   `Type` (Texte): Type de message (ex: `personal`, `business_inquiry`, `guild_communication`).
-   `ReadAt` (Date/Heure): Horodatage de lecture par le destinataire.
-   `CreatedAt` (Date/Heure): Date d'envoi du message.
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Table: RELEVANCIES

Informations jugées pertinentes pour un citoyen.

-   `RelevancyId` (Texte): Identifiant unique de la pertinence.
-   `Asset` (Texte): ID de l'entité concernée (ex: `BuildingId`, `ContractId`, `CitizenId`).
-   `AssetType` (Texte): Type de l'entité (ex: `building`, `contract`, `citizen`).
-   `Category` (Texte): Catégorie de la pertinence (ex: `opportunity`, `threat`, `information`).
-   `Type` (Texte): Type spécifique de pertinence (ex: `job_opening`, `low_stock_alert`).
-   `TargetCitizen` (Lien vers `CITIZENS` via `Username`): Citoyen à qui cette information est pertinente.
-   `RelevantToCitizen` (Lien vers `CITIZENS` via `Username`): (Semble redondant avec `TargetCitizen`, à clarifier).
-   `Score` (Nombre): Score de pertinence (plus élevé = plus pertinent).
-   `TimeHorizon` (Texte): Horizon temporel de la pertinence (ex: `immediate`, `short_term`, `long_term`).
-   `Title` (Texte): Titre concis de l'information.
-   `Description` (Texte multiligne): Description détaillée.
-   `Notes` (Texte multiligne): Notes ou contexte additionnel.
-   `Status` (Texte): Statut (ex: `new`, `acknowledged`, `action_taken`).
-   `CreatedAt` (Date/Heure): Date de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Table: RELATIONSHIPS

Liens et relations entre citoyens (bi-directionnel).

-   `RelationshipId` (Texte): Identifiant unique de la relation.
-   `Citizen1` (Lien vers `CITIZENS` via `Username`): Premier citoyen dans la relation par ordre alphabétique.
-   `Citizen2` (Lien vers `CITIZENS` via `Username`): Second citoyen dans la relation par ordre alphabétique.
-   `Title` (Texte): Type de relation (ex: `Friend`, `BusinessPartner`, `Family`, `Rival`).
-   `Description` (Texte multiligne): Description de la nature de la relation.
-   `LastInteraction` (Date/Heure): Horodatage de la dernière interaction significative.
-   `Tier` (Nombre): Niveau ou profondeur de la relation.
-   `Status` (Texte): Statut de la relation (ex: `active`, `strained`, `ended`).
-   `StrengthScore` (Nombre): Score de force de la relation.
-   `TrustScore` (Nombre): Score de confiance mutuelle.
-   `Notes` (Texte multiligne): Notes sur la relation.
-   `CreatedAt` (Date/Heure): Date de début de la relation ou de création de l'enregistrement.
-   `UpdatedAt` (Date/Heure): Date de dernière modification.

## Champs Enrichis par les API

En plus des champs directement stockés dans Airtable (décrits ci-dessus), plusieurs points d'accès API enrichissent les données retournées. Voici une liste non exhaustive des enrichissements courants :

**Note Générale :** La plupart des API convertissent les noms de champs Airtable de `PascalCase` en `camelCase` dans leur réponse JSON.

### API `/api/citizens`

En plus des champs de la table `CITIZENS` (convertis en camelCase) :
-   `worksFor` (string | null): Username de l'employeur du citoyen, dérivé des bâtiments où le citoyen est `Occupant` et la `Category` est 'business'.
-   `workplace` (object | null): Informations sur le lieu de travail :
    -   `name` (string): Nom du type de bâtiment.
    -   `type` (string): Type du bâtiment.
    -   `buildingId` (string): `BuildingId` personnalisé du lieu de travail.
-   `home` (string | null): `BuildingId` personnalisé du lieu de résidence du citoyen, dérivé des bâtiments où le citoyen est `Occupant` et la `Category` est 'home'.
-   `position` (object | null): Parsé depuis la chaîne JSON stockée dans Airtable.
-   `corePersonality` (array | null): Tableau de 3 chaînes de caractères, parsé depuis la chaîne JSON stockée.

### API `/api/lands`

Fusionne les données de la table `LANDS` avec les données de polygones (via `/api/get-polygons`) :
-   `polygonId` (string): Identifiant du polygone (généralement identique au `landId` d'Airtable).
-   `coordinates` (array): Coordonnées géométriques du polygone (peuvent surcharger celles d'Airtable).
-   `center` (object): Coordonnées du centre du polygone (peuvent surcharger celles d'Airtable).
-   `buildingPoints` (array): Liste des points de construction disponibles sur le terrain.
-   `bridgePoints` (array): Liste des points de ponts disponibles sur le terrain.
-   `canalPoints` (array): Liste des points de canaux disponibles sur le terrain.
-   Certains champs comme `historicalName`, `englishName` peuvent être surchargés par les données du polygone si absents dans Airtable.
-   (Note: `position`, `coordinates`, `center` sont parsés de chaîne JSON en objet/tableau JSON si nécessaire).

### API `/api/buildings` (GET)

En plus des champs de la table `BUILDINGS` (convertis en camelCase) :
-   `id` (string): Utilise le champ `BuildingId` d'Airtable. Si `BuildingId` est absent, l'ID d'enregistrement Airtable peut être utilisé comme fallback.
-   `position` (object | null): Coordonnées du bâtiment. Parsé depuis le champ `Position` (JSON string) ou dérivé du champ `Point`. Peut impliquer une conversion de coordonnées Three.js (x,z) en (lat,lng).
-   Les champs liés (comme `owner`, `occupant`, `runBy`) sont généralement retournés sous forme de chaînes (Usernames).

### API `/api/contracts`

Enrichit les données de la table `CONTRACTS` avec des informations sur les ressources (via `/api/resource-types`) et la localisation du vendeur :
-   `resourceName` (string): Nom lisible de la ressource.
-   `resourceCategory` (string): Catégorie de la ressource.
-   `resourceSubCategory` (string | null): Sous-catégorie de la ressource.
-   `resourceTier` (number | null): Tier de la ressource.
-   `resourceDescription` (string): Description de la ressource.
-   `resourceImportPrice` (number): Prix d'importation de la ressource.
-   `resourceLifetimeHours` (number | null): Durée de vie de la ressource en heures.
-   `resourceConsumptionHours` (number | null): Durée de consommation de la ressource en heures.
-   `imageUrl` (string): URL de l'icône de la ressource.
-   `location` (object | null): Coordonnées `{lat, lng}` du `SellerBuilding`. Dérivé en parsant l'ID du `SellerBuilding` (si format `building_lat_lng`) ou en appelant `/api/buildings/[buildingId]`.

### API `/api/resources` (GET)

Enrichit les données de la table `RESOURCES` avec des informations sur les types de ressources (via `/api/resource-types`) :
-   `id` (string): Utilise le champ `ResourceId` d'Airtable. Si `ResourceId` est absent, l'ID d'enregistrement Airtable peut être utilisé comme fallback.
-   `name` (string): Nom lisible de la ressource.
-   `category` (string): Catégorie de la ressource.
-   `subCategory` (string | null): Sous-catégorie de la ressource.
-   `tier` (number | null): Tier de la ressource.
-   `description` (string): Description de la ressource.
-   `importPrice` (number): Prix d'importation de la ressource.
-   `lifetimeHours` (number | null): Durée de vie de la ressource en heures.
-   `consumptionHours` (number | null): Durée de consommation de la ressource en heures.
-   `position` (object | null): Coordonnées de la ressource. Si `AssetType` est 'building', la position peut être dérivée de la position du bâtiment. Si `AssetType` est 'citizen', elle peut être dérivée de la position du citoyen. Le champ `Position` direct de la ressource est prioritaire s'il est rempli et valide.

## Priorités des Activités et Règles de Déclenchement

Cette section décrit l'ordre de priorité dans lequel les activités potentielles sont évaluées pour un citoyen, ainsi que les conditions principales pour leur déclenchement. Un numéro de priorité plus bas indique une priorité plus élevée.

| Priorité | Activité (Type Airtable)                 | Condition Horaire                     | Déclencheurs Principaux                                                                                                                               |
| :------- | :--------------------------------------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NIVEAU CRITIQUE (Départ / Survie Immédiate)**      |                                          |                                       |                                                                                                                       |
| 1        | `leave_venice` (Forestieri)              | Indifférent                           | `Forestieri` ET (confiance Conseil < -50 OU conditions de départ spécifiques).                                                                        |
| 2        | `eat_from_inventory`                     | Indifférent (si faim)                 | Faim (`AteAt` > 12h) ET nourriture dans l'inventaire.                                                                                                  |
| 3        | `eat_at_home`                            | Indifférent (si faim)                 | Faim ET est à la maison ET nourriture à la maison.                                                                                                     |
| 4        | `emergency_fishing`                      | Indifférent (si faim critique)        | Vit dans `fisherman_s_cottage` ET `AteAt` > 24h ET chemin vers lieu de pêche existe.                                                                    |
| 5        | `goto_home` (pour manger)                | Indifférent (si faim)                 | Faim ET PAS à la maison ET nourriture à la maison ET chemin existe. (Anciennement Prio 4)                                                               |
| 6        | `fetch_resource` (achat nourriture)     | Indifférent (si faim)                 | Faim ET PAS nourriture (inv./maison) ET a domicile ET magasin `retail_food` vend nourriture ET assez Ducats ET chemin existe. (Livre à la maison) (Anciennement Prio 5) |
| 7        | `eat_at_tavern`                          | Indifférent (si faim)                 | Faim ET est à la taverne ET taverne vend nourriture ET assez de Ducats. (Anciennement Prio 6)                                                         |
| 8        | `travel_to_inn` (pour manger)            | Indifférent (si faim)                 | Faim ET PAS à la taverne ET taverne proche vend nourriture ET assez de Ducats ET chemin existe. (Anciennement Prio 7)                                     |
| **NIVEAU HAUTE PRIORITÉ (Gestion Inventaire / Abri)** |                                          |                                       |                                                                                                                       |
| 10       | `goto_work` (pour dépôt inventaire)      | Indifférent                           | Inventaire > 70% plein ET a lieu de travail ET PAS au lieu de travail ET chemin existe.                                                               |
| 11       | _Dépôt direct à l'atelier_               | Indifférent                           | Inventaire > 70% plein ET est au lieu de travail. (Logique interne)                                                                                   |
| 12       | `check_business_status`                  | Jour (préféré)                        | Est `RunBy` d'une entreprise ET `CheckedAt` > 23h.                                                                                                    |
| 15       | `rest` (maison, nuit)                    | Nuit (`is_nighttime`)                 | A domicile ET est au domicile.                                                                                                                        |
| 16       | `goto_home` (repos nocturne)             | Nuit (`is_nighttime`)                 | A domicile ET PAS au domicile ET chemin existe.                                                                                                       |
| 17       | `rest` (auberge, nuit)                   | Nuit (`is_nighttime`)                 | (`Forestieri` OU résident sans domicile) ET est à l'auberge ET (assez de Ducats).                                                                       |
| 18       | `travel_to_inn` (repos nocturne)         | Nuit (`is_nighttime`)                 | (`Forestieri` OU résident sans domicile) ET PAS à l'auberge ET auberge proche existe ET chemin existe ET (assez de Ducats).                             |
| **NIVEAU MOYEN-HAUT (Travail - Construction)**       |                                          |                                       |                                                                                                                       |
| 20       | `deliver_construction_materials`         | Jour / Heures ouvrables (préféré)     | À l'atelier de construction ET matériaux prêts pour projet ET besoin au site ET chemin existe ET capacité de transport.                               |
| 21       | `construct_building`                     | Jour / Heures ouvrables (préféré)     | Au site de construction ET tous matériaux sur site ET `ConstructionMinutesRemaining` > 0.                                                           |
| 22       | `goto_construction_site`                 | Jour / Heures ouvrables (préféré)     | PAS au site de construction pertinent (pour livrer ou travailler) ET chemin existe.                                                                   |
| 23       | `fetch_resource` (pour atelier constr.)  | Jour / Heures ouvrables (préféré)     | À l'atelier de constr. ET besoin de matériaux pour projet ET source identifiée/trouvable ET chemin existe.                                            |
| **NIVEAU MOYEN (Travail - Production & Logistique)** |                                          |                                       |                                                                                                                       |
| 30       | `production`                             | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET bâtiment peut produire ET ressources d'entrée dispo. ET espace stockage sortie.                                           |
| 31       | `fetch_resource` (prod, contrat récurr.) | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET besoin ressources entrée ET contrat `recurrent` actif ET stock source dispo. ET chemin existe.                             |
| 32       | `fetch_resource` (prod, contrat public)  | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET besoin ressources entrée ET contrat `public_sell` actif ET stock source dispo. ET assez Ducats ET chemin existe.            |
| 33       | `goto_building_for_storage_fetch`        | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET besoin ressources entrée ET contrat `storage_query` actif ET stock entrepôt dispo. ET chemin vers entrepôt existe.         |
| 34       | `fetch_resource` (générique, prod.)      | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET besoin ressources entrée ET autres méthodes échouées ET source dynamique trouvable ET chemin existe.                       |
| 35       | `deliver_to_storage`                     | Jour / Heures ouvrables (préféré)     | Au travail (non-constr.) ET stockage > 80% ET contrat `storage_query` actif pour ressource en stock ET capacité entrepôt ET chemin vers entrepôt existe. |
| **NIVEAU MOYEN (Activités Forestieri - Jour)**       |                                          |                                       |                                                                                                                       |
| 40       | _Logique Forestieri Jour_                | Jour (PAS `is_nighttime`)             | `Forestieri`. (Appelle `process_forestieri_daytime_activity`)                                                                                         |
| **NIVEAU MOYEN-BAS (Shopping / Loisirs)**            |                                          |                                       |                                                                                                                       |
| 50       | `fetch_resource` (shopping personnel)    | Heures de shopping (`is_shopping_time` ET PAS `is_nighttime`) | Inventaire PAS plein ET a domicile ET contrat `public_sell` pour ressource souhaitée ET stock dispo. ET assez Ducats ET chemin existe.                 |
| **NIVEAU BAS (Tâches de Porteur)**                   |                                          |                                       |                                                                                                                       |
| 60       | _Logique Porteur_                        | Jour / Heures ouvrables (préféré)     | Opère `porter_guild_hall` ET est au `porter_guild_hall`. (Appelle `process_porter_activity`)                                                          |
| 61       | `goto_work` (Porteur vers Guild Hall)    | Jour / Heures ouvrables (préféré)     | Opère `porter_guild_hall` ET PAS au `porter_guild_hall` ET chemin existe.                                                                             |
| **NIVEAU FALLBACK**                                  |                                          |                                       |                                                                                                                       |
| 80       | `fishing`                                | Indifférent (préféré jour)            | Vit dans `fisherman_s_cottage` ET pas d'autre travail/besoin prioritaire ET chemin vers lieu de pêche existe.                                           |
| 99       | `idle`                                   | Indifférent                           | Aucune autre activité applicable.                                                                                                                     |
