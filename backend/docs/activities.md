# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Both AI and human citizens can engage in various activities. This system now encompasses not only long-duration tasks (like work or rest) but also strategic "actions" (like bidding on land or sending a message), which are now modeled as activities with corresponding records in the `ACTIVITIES` table. This unified approach allows for more complex, multi-step processes even for seemingly discrete actions.

Social class influences activity patterns:
-   **Nobili**: Do not seek "jobs" as `Occupant`. Their daytime activities revolve around managing their affairs, political engagements, social interactions, and leisure, including shopping. This makes them active consumers and potential patrons for various businesses. Their strategic "actions" (now activities) reflect their high-level management.
-   **Cittadini, Popolani, Facchini**: Engage in work, rest, and other daily life activities, including strategic actions modeled as activities.
-   **Forestieri**: Primarily engage in visitor-specific activities like lodging at inns and eventually leaving Venice. Their "actions" might include specific trade interactions.

Core activity categories include:

- **Repos (`rest`)**: Périodes de sommeil et de repos.
- **Travail (`production`, `fetch_resource`, etc.)**: Activités productives.
- **Consommation/Activités de Loisirs**: Repas, achats, socialisation.
- **Voyage (`goto_home`, `goto_work`, `goto_inn`, etc.)**: Déplacement entre les lieux.
- **Actions Stratégiques (maintenant modélisées comme des activités)**: Des `activityType` comme `bid_on_land`, `send_message`, `manage_public_sell_contract`, etc. Celles-ci sont initiées via `POST /api/activities/try-create`. Le moteur Python peut alors créer une ou plusieurs activités séquentielles. Par exemple, un `activityType: "bid_on_land"` pourrait d'abord générer une activité `goto_citizen` (pour rencontrer le vendeur ou l'officiel), et seulement après la complétion de celle-ci, une autre activité (ou une logique directe) pour finaliser l'enchère. Chaque étape pertinente aura un enregistrement dans la table `ACTIVITIES`.

Les activités principales (liste non exhaustive, incluant maintenant des "actions") :
- **Production**: Un citoyen à son lieu de travail transforme des ressources.
- **Fetch Resource**: Un citoyen se déplace pour récupérer des ressources.
- **Activités de Repas (`eat_from_inventory`, `eat_at_home`, `eat_at_tavern`)**.
- **Idle**: Attente ou activité non spécifique.
- **`bid_on_land` (en tant qu'activité)**: Peut impliquer un déplacement (`goto_citizen` ou `goto_notary`), suivi par la logique de l'enchère.
- **`send_message` (en tant qu'activité)**: Pourrait impliquer une courte activité de "rédaction" ou être traitée rapidement, mais aura toujours un enregistrement.
- **Business Activity & `CheckedAt` Updates**: La gestion active d'une entreprise par son `RunBy` met à jour `CheckedAt`.
- **`goto_construction_site`**, **`deliver_construction_materials`**, **`construct_building`**: Activités liées à la construction.
- **`leave_venice`**: Un Forestiero quitte Venise.

Activities are managed by the `createActivities.py` script (pour les activités routinières générées par le moteur) and initiated by AI agents via `POST /api/activities/try-create` (pour les activités et actions décidées par l'IA). Ces systèmes sont maintenant responsables de la création de **chaînes complètes d'activités** si nécessaire. Par exemple, une demande pour "manger à la maison" alors que le citoyen n'y est pas générera une activité `goto_home` suivie d'une activité `eat_at_home`. Tous ces enregistrements sont stockés dans la table `ACTIVITIES` et sont ensuite traités individuellement par `processActivities.py` lorsque leur `EndDate` est atteinte. Ce système s'applique de manière égale aux citoyens IA et humains.

### Unified Citizen Activity Model

The activity system is a core component of La Serenissima's unified citizen model, where AI and human citizens are treated as equal participants in the game world:

1. **Identical Activity Types**: Both AI and human citizens engage in the same types of activities
2. **Shared Scheduling Logic**: The same scheduling algorithms determine when activities occur
3. **Common Visualization**: Activities are displayed the same way on the map for all citizens
4. **Equal Time Constraints**: The same time-based rules apply to activity duration and transitions
5. **Unified Pathfinding**: All citizens use the same navigation system for movement

## Activity Types

### `deliver_resource_batch` (Galley Piloting)
When a merchant galley is ready to depart from a foreign port (simulated by `createimportactivities.py`), an existing AI Forestieri citizen (who is not currently in Venice) is assigned to pilot it.
- **Citizen**: An existing AI Forestieri. Their `InVenice` status is set to `True`.
- **Type**: `deliver_resource_batch`
- **ToBuilding**: The `BuildingId` of the temporary `merchant_galley` building created at a Venetian public dock.
- **Resources**: JSON array of resources and amounts being imported.
- **TransportMode**: `merchant_galley`
- **Notes**: Details the resources and original contract IDs.
- **Status**: `created`
- *Processor (executes upon arrival at the Venetian dock, i.e., when the `merchant_galley` `IsConstructed` becomes `True`)*:
    - The `merchant_galley` building becomes "active" in Venice.
    - The resources listed in the activity are considered to be in the galley, owned by the merchant who owns the galley (a wealthy Forestieri AI).
    - `createActivities.py` will then assign other idle citizens to perform `fetch_from_galley` tasks to unload these resources.
- *Processor (Citizen delivering to a final building, NOT a galley)*:
    - Resources are removed from the citizen's inventory.
    - Resources are added to the `ToBuilding`'s inventory.
    - Ownership of resources in `ToBuilding`:
        - If `ToBuilding` type has `commercialStorage: true` AND has a `RunBy` (operator): resources are owned by `RunBy`.
        - Else: resources are owned by the `Buyer` of the original contract associated with the delivery.
    - Financial transactions occur between the `Buyer` and `Seller` of the original contract.

### Rest

Rest activities occur during nighttime hours (10 PM to 6 AM Venice time). When night falls, citizens who are at home will automatically begin resting. Citizens who are not at home will attempt to return home to rest.

Rest activities include:
- Sleeping
- Evening meals
- Family time

### Travel (goto_home, goto_work, goto_inn)

When citizens need to move from one location to another, they engage in travel activities. These include:

- **`goto_home`**: Occurs when:
    - Night is approaching and citizens need to return home.
    - Citizens have been assigned new housing and need to relocate.
    - *Processor*: Upon arrival, any resources the citizen owns and is carrying are deposited into their home if space permits.

- **`goto_work`**: Occurs when:
    - It's daytime and a citizen needs to travel to their assigned workplace.
    - *Créateur*: Si le citoyen est à la maison et a de la nourriture disponible, il peut en prendre une unité pour son inventaire avant de partir.
    - *Processor*: Upon arrival:
        - If the workplace type has `commercialStorage: true`: The citizen can deposit any resources they are carrying. These resources become owned by the workplace operator (`RunBy`) once deposited.
        - If the workplace type has `commercialStorage: false`: The citizen can only deposit resources they are carrying if those resources are already owned by the workplace operator (`RunBy`).
        - Deposit only occurs if there is sufficient storage space in the workplace.

- **`goto_inn`**: Occurs when:
    - It's nighttime and a citizen marked as a visitor (with a `HomeCity` value) needs to find lodging.
    - *Processor*: Currently no specific processor, but the citizen arrives at the inn.

- Night is approaching and citizens need to return home
- Citizens have been assigned new housing and need to relocate

Travel activities use the transport pathfinding system to create realistic routes through Venice, including:
- Walking paths through streets and over bridges
- Gondola routes through canals

### Work

Citizens with jobs spend their daytime hours working at their assigned businesses. Work activities are created when:
- A citizen has been assigned to a business
- It's daytime and the citizen is not engaged in other activities

### Idle

When citizens have no specific task to perform but are not resting, they enter an idle state. Idle activities typically last for 1 hour before the system attempts to assign a new activity.

## Technical Implementation

### Activity Record Structure

Each activity is stored in the ACTIVITIES table with the following fields:

- **ActivityId**: Unique identifier for the activity (e.g., `goto_work_ctz_..._timestamp`)
- **Type**: The type of activity (e.g., `rest`, `goto_home`, `goto_work`, `goto_inn`, `idle`, `production`, `fetch_resource`, `deliver_resource_batch`, `leave_venice`, `deliver_construction_materials`, `construct_building`, `goto_construction_site`)
- **Citizen**: The `Username` of the citizen performing the activity.
- **FromBuilding**: Airtable Record ID of the starting location (for travel/production activities). Pour `construct_building`, c'est le site de construction. Pour `goto_construction_site`, peut être null si le départ est la position actuelle du citoyen.
- **ToBuilding**: Destination (for travel activities)
- **CreatedAt**: When the activity was created
- **StartDate**: When the activity begins
- **EndDate**: When the activity ends
- **Path**: JSON array of coordinates (for travel activities)
- **Notes**: Additional information about the activity

### Activity Creation Process

Le script `createActivities.py` (via `citizen_general_activities.py`) identifie les citoyens sans activité en cours et tente de leur assigner une nouvelle **séquence d'activités**. Un citoyen est considéré comme "sans activité en cours" si aucune activité avec ce citoyen comme `Citizen` n'a sa période (`StartDate` à `EndDate`) chevauchant l'heure actuelle. La logique de décision principale est encapsulée dans `citizen_general_activities.py` et prend en compte :
1.  L'heure actuelle à Venise.
2.  La classe sociale du citoyen, qui détermine ses plages horaires pour le repos, le travail et les loisirs/consommation.
    *   **Facchini (Journaliers)**: Repos: 21h-5h; Travail: 5h-12h, 13h-19h; Loisirs: 12h-13h, 19h-21h.
    *   **Popolani (Artisans)**: Repos: 22h-6h; Travail: 6h-12h, 14h-18h; Loisirs: 12h-14h, 18h-22h.
    *   **Cittadini (Marchands)**: Repos: 23h-6h; Travail: 7h-12h, 14h-17h; Loisirs: 6h-7h, 12h-14h, 17h-23h.
    *   **Nobili (Nobles)**: Repos: 0h-8h; Loisirs/Gestion: 8h-0h (le reste du temps).
    *   **Forestieri (Marchands Étrangers)**: Repos: 23h-5h; Travail/Commerce: 6h-12h, 13h-20h; Loisirs: 5h-6h, 12h-13h, 20h-23h.
3.  Les besoins urgents du citoyen (faim, inventaire plein).
4.  Son statut (résident, visiteur, sans-abri, employé, etc.).
5.  Sa localisation actuelle et la disponibilité de lieux pertinents (domicile, lieu de travail, auberges, magasins).

**Priorités générales (illustratives, la logique exacte est dans le code) :**
*   **Urgence absolue** : Départ de Venise pour les Forestieri si conditions remplies.
*   **Besoins physiologiques** : Manger (depuis inventaire, domicile, taverne/magasin), généralement pendant les périodes de loisirs. Pêche d'urgence pour les Facchini affamés.
*   **Repos** : Si c'est l'heure de repos pour sa classe, le citoyen cherchera à dormir (domicile ou auberge).
*   **Travail** : Si c'est l'heure de travail :
    *   Déposer un inventaire plein au travail.
    *   Se rendre au travail s'il n'y est pas.
    *   Une fois au travail : tâches de construction, production, réapprovisionnement, pêche (Facchini), gestion (Cittadini/Forestieri).
*   **Loisirs/Consommation** : Si c'est l'heure des loisirs :
    *   Shopping (nourriture ou autres biens).
    *   Autres activités de loisirs (non encore implémentées en détail).
*   **Gestion d'entreprise** (pour les `RunBy`) : Vérifier le statut de l'entreprise si cela n'a pas été fait récemment, pendant les heures actives.
*   **Inactivité (`idle`)** : Si aucune autre activité n'est appropriée ou possible.

### Pathfinding for Travel Activities

Travel activities use the TransportService to calculate realistic paths:

1. Determine the start point (citizen's current location)
2. Determine the end point (destination building)
3. Use the transport API to find the optimal path
4. Store the path coordinates in the activity record
5. Calculate the expected arrival time based on distance and travel mode

### Activity Visualization

The frontend can visualize citizen activities by:
- Displaying citizens at their current locations
- Animating movement along travel paths
- Showing appropriate icons for different activity types
- Providing activity information in the citizen detail view

## AI and Human Citizen Integration

The activity system treats AI and human citizens identically:

1. **Unified Activity Model**: Both AI and human citizens use the same activity data structure and follow the same rules
2. **Shared Visualization**: All citizens appear on the map and can be observed performing their activities
3. **Equal Scheduling**: The activity creation system schedules activities for all citizens regardless of whether they are AI or human
4. **Economic Impact**: Activities for both AI and human citizens have the same economic effects (e.g., working generates income)
5. **Interaction Opportunities**: Human players can encounter and interact with AI citizens performing their activities

The key difference is that AI citizens have their activities automatically determined by the system, while human players can potentially override certain activities through direct gameplay actions. This integration creates a seamless world where AI and human citizens coexist and follow the same daily patterns.

## Integration with Other Systems

The activity system integrates with several other game systems:

### Housing System

- When citizens are assigned new housing, they need to travel to their new homes
- Housing quality affects rest effectiveness
- Housing location affects travel times to work and other destinations

### Employment System

- Citizens travel to their workplaces during work hours
- Work activities generate income for businesses
- Job locations affect citizens' daily travel patterns

### Time System

- Activities are scheduled based on the in-game time
- Day/night cycle affects which activities are appropriate
- Activity durations are calculated based on realistic timeframes

## Future Enhancements

Planned enhancements to the activity system include:

1. **Social Activities**: Citizens visiting friends or attending social gatherings
2. **Shopping**: Citizens visiting contracts to purchase goods
3. **Religious Activities**: Church attendance and religious ceremonies
4. **Entertainment**: Visiting taverns, theaters, and other entertainment venues
5. **Seasonal Activities**: Special activities during festivals and holidays

## Troubleshooting

Common issues with the activity system:

1. **Citizens stuck in idle**: May indicate pathfinding failures or missing home/work assignments
2. **Overlapping activities**: Can occur if the activity creation script runs before previous activities complete
3. **Invalid paths**: May result from changes to the map or building data
4. **Missing activities**: Can occur if the activity creation script fails to run on schedule

To resolve these issues, check the activity creation logs and ensure all related systems (housing, employment, transport) are functioning correctly.

## API-Driven Activity Creation

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the
`POST /api/actions/create-activity` endpoint (for direct creation of a single activity when all details are known) and
`POST /api/activities/try-create` (for AI-initiated endeavors where the engine will build the necessary activity
chain).

### Gestion des Activités Simultanées et Séquentielles

Le système gère les activités des citoyens de la manière suivante :

1. **Activités Simultanées** : Le système ne permet généralement pas à un citoyen d'avoir plusieurs activités simultanées. Lorsqu'une activité est en cours (l'heure actuelle se situe entre son `StartDate` et son `EndDate`), le script `createActivities.py` n'assignera pas de nouvelle activité à ce citoyen.

2. **Chaînes d'Activités** : Lors de l'utilisation de `POST /api/activities/try-create` pour des actions complexes (comme `manage_public_sell_contract` ou `initiate_building_project`), le système crée une chaîne d'activités séquentielles où :
   - Chaque activité dans la chaîne a un `StartDate` égal au `EndDate` de l'activité précédente
   - Toutes les activités de la chaîne sont créées en même temps avec le statut `created`
   - Si une activité dans la chaîne échoue, les activités suivantes sont automatiquement marquées comme `failed`

3. **Priorités et Interruptions** : Les activités créées par le moteur suivent une hiérarchie de priorités (voir la section "Priorités des Activités"). Cependant, une fois qu'une activité est en cours, elle n'est pas interrompue par des activités de priorité plus élevée - ces dernières devront attendre que l'activité en cours soit terminée.

4. **Activités Créées par l'API** : Les activités créées directement via l'API sont soumises aux mêmes règles - elles ne peuvent pas être assignées à un citoyen qui a déjà une activité en cours, sauf si elles sont explicitement programmées pour commencer après la fin de l'activité actuelle.

## Actions Stratégiques des Citoyens (en tant qu'Activités)

Cette section détaille les actions stratégiques et économiques que les citoyens peuvent entreprendre. Conformément au
modèle unifié, **ces "actions" sont initiées en tant qu'"activités" via l'endpoint `POST /api/activities/try-create`**.
Chaque action listée ci-dessous correspondra à un `activityType` spécifique.

L'initiation via `try-create` permettra au moteur Python de déterminer la séquence d'activités nécessaire. Par exemple,
une action `bid_on_land` pourrait d'abord générer une activité de déplacement, avant que l'enchère elle-même ne soit
traitée. Chaque étape pertinente de ce processus aura un enregistrement dans la table `ACTIVITIES`.

Les `activityType` listés ci-dessous sont à utiliser avec `POST /api/activities/try-create`. Les `activityParameters`
pour cet endpoint devront contenir les informations spécifiques à chaque action.

### Gestion Foncière et Immobilière

1.  **Faire une Offre sur un Terrain**
    *   **activityType**: `bid_on_land`
    *   **Description**: Le citoyen se déplace physiquement vers un lieu officiel (ex: `courthouse` ou `town_hall`)
pour y soumettre formellement une offre sur une parcelle de terrain. L'enregistrement de l'offre, potentiellement soumis à des frais d'enregistrement ou à une petite taxe, se fait après cette interaction sur place (pour calibrer la taxe/frais, le salaire moyen est à 2000 Ducats/jour dans le jeu).
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `courthouse` ou `town_hall`). Une fois arrivé, une activité de soumission d'offre (`activityType:
submit_land_bid_offer`, durée courte) est créée. Le processeur de `submit_land_bid_offer` appellera `POST
/api/contracts` pour enregistrer l'enchère et déduira les frais applicables du citoyen.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `bidAmount`,
`targetBuildingId` (optionnel, ID du `courthouse` ou `town_hall` pertinent).

2.  **Acheter un Terrain Disponible**
    *   **activityType**: `buy_available_land`
    *   **Description**: Le citoyen se déplace physiquement vers un lieu officiel (ex: `courthouse` ou `town_hall`)
pour y finaliser l'achat direct d'une parcelle de terrain. La transaction (vérification des fonds, transfert de
propriété), qui inclut le paiement du terrain ainsi que d'éventuels frais de transaction ou taxes foncières, est effectuée après cette interaction sur place.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `courthouse` ou `town_hall`). Une fois arrivé, une activité de finalisation d'achat (`activityType:
finalize_land_purchase`, durée courte) est créée. Le processeur de cette dernière gérera la transaction et les paiements associés.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `expectedPrice`,
`fromBuildingId` (optionnel), `targetBuildingId` (ID du `courthouse` ou `town_hall` pertinent).

3.  **Initier un Projet de Construction de Bâtiment**
    *   **activityType**: `initiate_building_project`
    *   **Description**: Le citoyen se rend sur le terrain (`landId`), pour obtenir un permis de construire (moyennant des frais), ou à un `masons_lodge` / `master_builders_workshop` (atelier de constructeur) pour soumettre les plans et
lancer le projet, ce qui peut impliquer des frais de dossier ou un acompte.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`) vers le terrain pour inspection. À l'arrivée, une activité d'inspection (`activityType: inspect_land_plot`, durée courte) est créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `town_hall` ou de l'atelier du constructeur) est créée. Finalement, une activité de soumission de projet (`activityType: submit_building_project`, durée courte) est créée, durant laquelle les paiements initiaux (permis, frais) sont effectués et le bâtiment est créé avec `IsConstructed: false`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`, `buildingTypeDefinition`,
`pointDetails`, `builderContractDetails` (optionnel, incluant `builderUsername` et `contractValue`), `targetOfficeBuildingId` (optionnel, ID du `town_hall` ou de l'atelier).

1.  **Ajuster le Prix de Location d'un Terrain**
    *   **activityType**: `adjust_land_lease_price`
    *   **Description**: Le propriétaire foncier se rend à son domicile, à un bureau qu'il gère, ou à un
`public_archives` (bureau du cadastre) pour enregistrer la modification du bail, ce qui peut entraîner des frais de dépôt.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou
`public_archives`). À l'arrivée, une activité `file_lease_adjustment` est créée, et les frais sont payés.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `landId`,
`newLeasePrice`, `strategy`, `targetOfficeBuildingId` (optionnel, ID du `public_archives`).

2.  **Ajuster le Prix de Loyer d'un Bâtiment**
    *   **activityType**: `adjust_building_rent_price`
    *   **Description**: Le propriétaire du bâtiment se rend à son domicile, bureau, ou un `public_archives` pour
enregistrer la modification du loyer, potentiellement en payant des frais d'enregistrement.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile, bureau personnel, ou
`public_archives`). À l'arrivée, une activité `file_rent_adjustment` est créée, et les frais sont acquittés.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingId`, `newRentPrice`,
`strategy`, `targetOfficeBuildingId` (optionnel, ID du `public_archives`).

### Commerce et Contrats

6.  **Créer/Modifier un Contrat de Vente Publique**
    *   **activityType**: `manage_public_sell_contract`
    *   **Description**: Le citoyen se rend à son bâtiment de vente (`sellerBuildingId`) pour préparer les
marchandises, puis se déplace vers un lieu de marché (ex: `market_stall`, `merceria`, `weighing_station`) pour y
enregistrer ou modifier son offre de vente publique. L'utilisation d'un étal de marché ou la pesée officielle peuvent entraîner des frais ou une commission sur les ventes futures.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
`sellerBuildingId`). À l'arrivée, une activité de préparation (`activityType: prepare_goods_for_sale`, durée courte)
peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du
`market_stall`, etc.) est créée. Finalement, une activité d'enregistrement de contrat (`activityType:
register_public_sell_offer`, durée courte) est créée, durant laquelle les frais initiaux de marché sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel),
`resourceType`, `pricePerResource`, `targetAmount`, `sellerBuildingId`, `targetMarketBuildingId` (ID du `market_stall`,
`merceria`, ou `weighing_station`).

7.  **Modifier le Prix d'une Vente Publique**
    *   **activityType**: `modify_public_sell_price` (Note: `manage_public_sell_contract` avec un `contractId` existant
est la méthode préférée.)
    *   **Description**: Le citoyen se rend à un lieu de marché (ex: `market_stall`, `weighing_station`) ou à son
bâtiment de vente pour y soumettre une modification de prix pour un contrat de vente publique existant. Des frais de modification peuvent s'appliquer.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `market_stall` ou `sellerBuildingId`). À l'arrivée, une activité de modification de prix (`activityType:
submit_price_modification`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `newPricePerResource`,
`targetBuildingId` (ID du lieu de modification).

8.  **Terminer un Contrat de Vente Publique**
    *   **activityType**: `end_public_sell_contract`
    *   **Description**: Le citoyen se rend à un lieu de marché (ex: `market_stall`, `weighing_station`) ou à son
bâtiment de vente pour y notifier la fin de son offre de vente publique. Des frais de résiliation anticipée ou de dossier peuvent être perçus.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `market_stall` ou `sellerBuildingId`). À l'arrivée, une activité de terminaison de contrat (`activityType:
submit_contract_termination`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId`, `targetBuildingId` (ID du
lieu de notification).

9.  **Créer/Modifier un Contrat d'Importation**
    *   **activityType**: `manage_import_contract`
    *   **Description**: Le citoyen se déplace vers un bureau de commerce (ex: `customs_house`, `broker_s_office`) pour y enregistrer ou modifier un contrat d'importation. L'enregistrement du contrat peut impliquer des frais de courtage ou des droits de douane anticipés.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `customs_house` ou `broker_s_office`). À l'arrivée, une activité d'enregistrement de contrat (`activityType: register_import_agreement`, durée courte) est créée, durant laquelle les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `pricePerResource`, `buyerBuildingId` (optionnel, si non fourni, le système recherchera des contrats d'importation publics correspondants), `targetOfficeBuildingId` (ID du `customs_house` ou `broker_s_office`).

10. **Créer/Modifier un Contrat d'Importation Public**
    *   **activityType**: `manage_public_import_contract`
    *   **Description**: Le citoyen se déplace vers un bureau de commerce (ex: `customs_house`, `broker_s_office`) pour y enregistrer ou modifier une offre publique d'importation. Cette offre permet à n'importe quel marchand de vendre les ressources spécifiées au citoyen. L'enregistrement du contrat implique des frais de courtage.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `customs_house` ou `broker_s_office`). À l'arrivée, une activité d'enregistrement d'offre publique (`activityType: register_public_import_agreement`, durée courte) est créée, durant laquelle les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType`, `targetAmount`, `pricePerResource`, `targetOfficeBuildingId` (ID du `customs_house` ou `broker_s_office`).

10. **Créer/Modifier une Offre de Stockage Public**
    *   **activityType**: `manage_public_storage_offer`
    *   **Description**: Le citoyen se rend à son bâtiment de stockage (`sellerBuildingId`, ex: `small_warehouse`,
`granary`) pour évaluer la capacité, puis se déplace vers un lieu de marché (ex: `weighing_station`) pour y
enregistrer/modifier son offre de stockage. Des frais d'enregistrement ou une commission sur les futurs frais de stockage peuvent être demandés.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
`sellerBuildingId`). À l'arrivée, une activité d'évaluation de capacité (`activityType: assess_storage_capacity`, durée
courte) peut être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `weighing_station` ou `market_stall`) est créée. Finalement, une activité d'enregistrement d'offre
(`activityType: register_public_storage_contract`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST
/api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel),
`sellerBuildingId` (ID de l'entrepôt), `resourceType` (ou "any"), `capacityOffered`, `pricePerUnitPerDay`,
`pricingStrategy`, `targetMarketBuildingId` (optionnel, ID du lieu de marché).

11. **Faire une Offre d'Achat sur un Bâtiment Existant**
    *   **activityType**: `bid_on_building`
    *   **Description**: Le citoyen se rend au bâtiment cible (`buildingIdToBidOn`) pour l'inspecter. Ensuite, il se
déplace vers un lieu officiel (ex: `courthouse`, `town_hall`) ou rencontre le propriétaire (`targetOwnerUsername`) pour
soumettre formellement son offre d'achat. Le dépôt de l'offre peut être soumis à des frais de dossier.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
`buildingIdToBidOn`) pour inspection. À l'arrivée, une activité d'inspection (`activityType:
inspect_building_for_purchase`, durée courte) peut être créée. Ensuite, une autre activité de déplacement
(`activityType: goto_location`, `targetBuildingId`: ID du `courthouse`/`town_hall` ou localisation du
`targetOwnerUsername`) est créée. Finalement, une activité de soumission d'offre (`activityType:
submit_building_purchase_offer`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingIdToBidOn`, `bidAmount`,
`targetOwnerUsername` (optionnel), `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`).

12. **Accepter/Refuser une Offre sur un Bâtiment Possédé**
    *   **activityType**: `respond_to_building_bid`
    *   **Description**: Le propriétaire du bâtiment se rend à un lieu officiel (ex: `courthouse`, `town_hall`) ou
rencontre l'enchérisseur (`bidderUsername`) pour communiquer formellement sa décision (accepter ou refuser) concernant
une offre d'achat. L'enregistrement de la décision peut entraîner des frais administratifs. Si la vente est acceptée, des taxes de transaction seront dues.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `courthouse`/`town_hall` ou localisation du `bidderUsername`). À l'arrivée, une activité de communication de
décision (`activityType: communicate_bid_response`, durée courte) est créée, les frais administratifs sont payés, et le processeur mettra à jour le
contrat via `POST /api/contracts`. Les taxes de transaction sont gérées lors de la finalisation de la vente.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`, `response`
("accepted" ou "refused"), `bidderUsername` (optionnel, pour le déplacement), `targetOfficeBuildingId` (optionnel, ID
du `courthouse`/`town_hall`).

13. **Retirer une Offre d'Achat sur un Bâtiment**
    *   **activityType**: `withdraw_building_bid`
    *   **Description**: L'enchérisseur se rend à un lieu officiel (ex: `courthouse`, `town_hall`) ou rencontre le
propriétaire du bâtiment (`targetOwnerUsername`) pour notifier formellement le retrait de son offre d'achat. Des frais de dossier pour le retrait peuvent être exigés.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `courthouse`/`town_hall` ou localisation du `targetOwnerUsername`). À l'arrivée, une activité de notification de
retrait (`activityType: notify_bid_withdrawal`, durée courte) est créée, les frais sont payés, et le processeur mettra à jour le contrat
via `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `buildingBidContractId`,
`targetOwnerUsername` (optionnel, pour le déplacement), `targetOfficeBuildingId` (optionnel, ID du
`courthouse`/`town_hall`).

14. **Créer/Gérer un Contrat d'Achat avec Majoration (Markup Buy Contract)**
    *   **activityType**: `manage_markup_buy_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer un besoin urgent, puis se
déplace vers un lieu de marché (ex: `market_stall`, `weighing_station`) pour y enregistrer un contrat d'achat avec
majoration. Des frais de publication d'annonce ou de courtage peuvent s'appliquer.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
`buyerBuildingId`). À l'arrivée, une activité d'évaluation (`activityType: assess_urgent_need`, durée courte) peut être
créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du
`market_stall`/`weighing_station`) est créée. Finalement, une activité d'enregistrement de contrat (`activityType:
register_markup_buy_agreement`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel),
`resourceType`, `targetAmount`, `maxPricePerResource`, `buyerBuildingId`, `targetMarketBuildingId` (ID du lieu de
marché).

15. **Créer/Gérer un Contrat de Demande de Stockage (Storage Query Contract)**
    *   **activityType**: `manage_storage_query_contract`
    *   **Description**: Le citoyen se rend à son bâtiment (`buyerBuildingId`) pour évaluer ses besoins de stockage,
puis se déplace vers un lieu de marché (ex: `market_stall`, `weighing_station`) pour y enregistrer une demande de
stockage. Des frais de publication de demande peuvent être perçus.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
`buyerBuildingId`). À l'arrivée, une activité d'évaluation (`activityType: assess_storage_needs`, durée courte) peut
être créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du
`market_stall`/`weighing_station`) est créée. Finalement, une activité d'enregistrement de demande (`activityType:
register_storage_request_contract`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel),
`resourceType`, `amountNeeded`, `durationDays`, `buyerBuildingId`, `targetMarketBuildingId` (ID du lieu de marché).

16. **Créer/Gérer un Contrat de Service Logistique**
    *   **activityType**: `manage_logistics_service_contract`
    *   **Description**: Le citoyen se rend à son bâtiment client (`clientBuildingId`) pour évaluer les besoins logistiques, puis se déplace vers une guilde de porteurs (`porter_guild_hall`) pour y enregistrer ou modifier un contrat de service logistique. Des frais d'enregistrement ou une commission sur les futurs services peuvent être perçus.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`: `clientBuildingId`). À l'arrivée, une activité d'évaluation (`activityType: assess_logistics_needs`, durée courte) est créée. Ensuite, une autre activité de déplacement (`activityType: goto_location`, `targetBuildingId`: ID du `porter_guild_hall`) est créée. Finalement, une activité d'enregistrement de contrat (`activityType: register_logistics_service_contract`, durée courte) est créée, les frais sont payés, et le processeur appellera `POST /api/contracts`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `contractId` (optionnel), `resourceType` (optionnel, pour logistique spécifique à un type de ressource), `serviceFeePerUnit`, `clientBuildingId`, `targetGuildHallId` (ID du `porter_guild_hall`).

### Gestion du Travail et des Entreprises

16. **Ajuster les Salaires d'une Entreprise**
    *   **activityType**: `adjust_business_wages`
    *   **Description**: Le gestionnaire se rend à son entreprise (`businessBuildingId`) pour mettre à jour le registre
des salaires.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `businessBuildingId`). À l'arrivée, une
activité `update_wage_ledger` est créée.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`, `newWageAmount`,
`strategy`.

17.  **Déléguer une Entreprise / Demander ou Prendre une Entreprise pour Soi**
    *   **activityType**: `change_business_manager`
    *   **Description**: Implique de se rendre au bâtiment de l'entreprise, puis se rendre à un `courthouse`/`town_hall` (étude de notaire) pour officialiser le changement d'opérateur, ce qui peut entraîner des frais notariaux ou d'enregistrement.
    *   **Mécanisme Principal**: Séquence : `goto_location` (vers `businessBuildingId`), puis `goto_location` (vers la
partie concernée ou `courthouse`/`town_hall`). À la destination finale, une activité `finalize_operator_change` est
créée, et les frais associés sont payés.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `businessBuildingId`,
`newOperatorUsername` (si applicable), `currentOperatorUsername` (si applicable), `ownerUsername` (si applicable),
`reason`, `targetOfficeBuildingId` (optionnel, ID du `courthouse`/`town_hall`), `operationType` ("delegate",
"request_management", "claim_management").
    *   **Types d'Opérations**:
        * **delegate**: Le gestionnaire actuel délègue la gestion à un autre citoyen.
        * **request_management**: Un citoyen demande à devenir gestionnaire d'une entreprise.
        * **claim_management**: Le propriétaire reprend la gestion de son entreprise.

### Finance

18. **Demander un Prêt**
    *   **activityType**: `request_loan`
    *   **Description**: Le citoyen se déplace physiquement vers un établissement financier (ex: `broker_s_office`,
`mint`) ou rencontre un prêteur connu pour y soumettre une demande de prêt. Des frais de dossier ou d'évaluation peuvent être exigés par l'établissement.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `broker_s_office`/`mint` ou localisation du `lenderUsername`). À l'arrivée, une activité de soumission de demande
(`activityType: submit_loan_application_form`, durée courte) est créée, les frais sont payés, et le processeur crée un enregistrement dans la table `LOANS` avec le statut "pending_approval".
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `amount`, `purpose`, `collateralDetails`
(optionnel), `targetBuildingId` (optionnel, ID du `broker_s_office`/`mint`), `lenderUsername` (optionnel, pour le
déplacement).

19. **Offrir un Prêt**
    *   **activityType**: `offer_loan`
    *   **Description**: Le citoyen se rend à un établissement financier (ex: `broker_s_office`, `mint`) ou à une étude
notariale (ex: `courthouse`, `town_hall`) pour y enregistrer une offre de prêt. Des frais d'enregistrement ou de publication de l'offre peuvent être perçus.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`, `targetBuildingId`:
ID du `broker_s_office`/`mint` ou `courthouse`/`town_hall`). À l'arrivée, une activité d'enregistrement d'offre de prêt
(`activityType: register_loan_offer_terms`, durée courte) est créée, les frais sont payés, et un enregistrement est créé dans la table `LOANS` avec le statut "offered".
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `targetBorrowerUsername` (optionnel),
`amount`, `interestRate`, `termDays`, `targetOfficeBuildingId` (ID de l'établissement pertinent).

### Social et Communication

22. **Envoyer un Message**
    *   **activityType**: `send_message`
    *   **Description**: Le citoyen se déplace physiquement vers la position du destinataire
(`receiverUsername`), son domicile, ou son lieu de travail (`targetBuildingId`) pour lui remettre un message en
personne. L'activité `reply_to_message` est créée automatiquement et effectuée à l'arrivée du citoyen.
    *   **Mécanisme Principal**: Crée une activité de déplacement (`activityType: goto_location`,
`targetCitizenUsername`: `receiverUsername` ou `targetBuildingId`). Une fois à proximité ou à destination, une activité
de remise de message (`activityType: deliver_message_interaction`, durée courte) est créée. Le processeur crée un enregistrement dans la table `MESSAGES`, met à jour ou crée une relation dans la table `RELATIONSHIPS`, et crée automatiquement une activité `reply_to_message` pour le destinataire.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `receiverUsername`, `content`,
`messageType` (optionnel), `targetBuildingId` (optionnel, lieu de rencontre privilégié comme le domicile ou lieu de
travail du destinataire).

1.  **Répondre à un Message**
    *   **activityType**: `reply_to_message`
    *   **Description**: Activité créée automatiquement lorsqu'un citoyen reçoit un message. Le citoyen est déjà à l'emplacement où il a reçu le message original, donc aucun déplacement n'est nécessaire.
    *   **Mécanisme Principal**: Cette activité est automatiquement créée par le processeur de `deliver_message_interaction` et programmée pour commencer 10 minutes après la réception du message. Le processeur crée un message de réponse, met à jour la relation entre les citoyens, et envoie une notification à l'expéditeur original.
    *   **Paramètres Attendus**: Aucun paramètre n'est attendu de l'utilisateur car cette activité est créée automatiquement avec tous les détails nécessaires.

1.  **Mettre à Jour son Profil Citoyen**
    *   **activityType**: `update_citizen_profile`
    *   **Description**: Le citoyen se rend à son domicile ou à un `public_archives` (bureau public) pour enregistrer
les modifications. Des frais de dossier peuvent être demandés au `public_archives`.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers domicile ou `public_archives`). À l'arrivée,
une activité `file_profile_update` est créée, et les frais sont payés si applicable.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `citizenAirtableId`, `firstName`,
`lastName`, `familyMotto`, `coatOfArmsImageUrl`, `telegramUserId` (tous optionnels), `targetOfficeBuildingId`
(optionnel, ID du `public_archives`).

1.  **Gérer son Appartenance à une Guilde**
    *   **activityType**: `manage_guild_membership`
    *   **Description**: Le citoyen se rend au `guild_hall` de la guilde concernée pour effectuer une action liée à son
appartenance (rejoindre, quitter, accepter une invitation). Des frais d'adhésion ou des cotisations peuvent être dus à la guilde.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers le `guildHallBuildingId` qui est un
`guild_hall`). À l'arrivée, une activité `perform_guild_membership_action` est créée, et les paiements à la guilde sont effectués si nécessaire.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `guildId`, `membershipAction` ("join",
"leave", "accept_invite"), `guildHallBuildingId` (ID du `guild_hall` spécifique).

1.  **Générer/Enregistrer une Pensée Stratégique**
    *   **activityType**: `log_strategic_thought`
    *   **Description**: Le citoyen prend un moment pour réfléchir, potentiellement dans un lieu privé (domicile,
bureau) ou simplement sur place. La pensée est ensuite enregistrée.
    *   **Mécanisme Principal**: Peut être une activité `ponder_at_location` (courte durée sur place) ou
`goto_location` (vers domicile/bureau) suivie de `record_thought`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `context` (optionnel), `visibility`,
`ponderLocationBuildingId` (optionnel, ID du lieu de réflexion).

1.  **Marquer des Notifications comme Lues**
    *   **activityType**: `mark_notifications_read`
    *   **Description**: Le citoyen prend un moment (à son emplacement actuel ou à son domicile/bureau) pour examiner
et marquer ses notifications.
    *   **Mécanisme Principal**: Crée une activité `review_notifications_at_location` (courte durée). Le processeur
appellera `POST /api/notifications/mark-read`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `notificationIds`.

### Personnalisation

28. **Télécharger un Blason**
    *   **activityType**: `upload_coat_of_arms`
    *   **Description**: Le joueur se rend à une `art_academy` ou un `bottega` (atelier d'artiste/bureau héraldique)
pour faire enregistrer son nouveau blason. Des frais pour le service de l'artiste ou pour l'enregistrement héraldique peuvent être demandés.
    *   **Mécanisme Principal**: Crée une activité `goto_location` (vers `art_academy` ou `bottega`). À l'arrivée, une
activité `submit_coat_of_arms_design` est créée, et les frais sont payés.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `imageData` ou `filename`,
`targetOfficeBuildingId` (optionnel, ID de l'`art_academy`/`bottega`).

29. **Mettre à Jour les Paramètres Citoyen**
    *   **activityType**: `update_citizen_settings`
    *   **Description**: Le joueur prend un moment (à son emplacement actuel ou à son domicile) pour ajuster ses
paramètres personnels.
    *   **Mécanisme Principal**: Crée une activité `access_personal_settings_at_location` (courte durée). Le processeur
appellera `POST /api/citizen/settings`.
    *   **Paramètres Attendus (pour `activityParameters` dans `try-create`)**: `settingsObject`.


### Process:

1.  **Client-Side Decision**: The client (e.g., Kinos AI) determines the full details of the activity to be created. This includes:
    *   `citizenUsername`: The target citizen.
    *   `activityType`: The specific type of activity.
    *   `title`: A concise title for the activity.
    *   `description`: A brief description of what the activity entails.
    *   `thought`: A first-person narrative from the citizen about this activity.
    *   `activityDetails`: A JSON object containing all necessary parameters for that activity type.
        *   For travel-related activities (e.g., `goto_work`, `goto_home`, `fetch_resource` from a specific building), the client should provide `toBuildingId` and `fromBuildingId` (if applicable) within `activityDetails`. The `/api/actions/create-activity` endpoint (si utilisé pour une activité de voyage unique) appellera alors en interne `/api/transport` pour déterminer le chemin et la durée.
    *   `notes` (optional): Internal notes or non-displayed information.
2.  **API Request**: The client sends a POST request to `/api/actions/create-activity` with the composed payload for a single activity.
3.  **Server Validation & Pathfinding**: The API endpoint validates the payload. If it's a travel activity requiring pathfinding between specified buildings, the server attempts to find a path. If pathfinding fails, an error is returned.
4.  **Airtable Record Creation**: If validation and any necessary internal pathfinding succeed, a new activity record is created in the `ACTIVITIES` table with `Status: "created"`. The `Path`, `StartDate`, and `EndDate` fields are populated based on the pathfinding results. `Title`, `Description`, `Thought`, and `Notes` are also saved.
5.  **Engine Processing**: The standard `processActivities.py` script will eventually pick up this "created" activity when its `EndDate` is reached and execute its corresponding processor logic to finalize its effects. Il ne créera pas d'activité de suivi.

### Use Cases:

-   **Unguided AI**: Allows AI agents to have fine-grained control over their actions, enabling more complex or emergent behaviors.
-   **External Tools**: Could allow other tools or game masters to inject specific activities into the simulation.
-   **Player-Initiated Complex Actions (Future)**: Could potentially be used by the UI to initiate complex, multi-step actions that are best defined as a specific activity.

### Utility Endpoint: `POST /api/try-read`

To simplify common data retrieval tasks for AI agents, a utility endpoint `POST /api/try-read` is available. This endpoint allows an AI to request predefined GET operations using a simple JSON payload.

**Request Body Example:**
```json
{
  "requestType": "get_my_profile",
  "parameters": { "username": "NLR" }
}
```

**Supported `requestType` values include:**
`get_my_profile`, `get_my_lands`, `get_my_buildings`, `get_my_inventory`, `get_my_active_sell_contracts`, `get_my_active_import_contracts`, `get_my_problems`, `get_my_opportunities`, `get_my_latest_activity`, `get_lands_for_sale`, `get_building_types`, `get_resource_types`, `get_public_builders`, `get_stocked_public_sell_contracts`, `get_global_thoughts`, `get_citizen_thoughts`, `get_all_guilds`, `get_active_decrees`, `get_data_package`, `get_building_details`, `get_building_resources`, `get_land_details`, `get_problem_details`.

Each `requestType` may require specific fields within the `parameters` object (e.g., `username`, `buildingId`). Refer to the main API Reference for details on each underlying GET request.

This endpoint internally calls the relevant GET API and returns its response, wrapped in a success/error structure. It helps abstract away the specific URL construction and parameter formatting for common queries.

### Considerations:

-   The client (AI) is responsible for providing correct building IDs for travel when using `POST /api/actions/create-activity`. The server handles the pathfinding.
-   This method bypasses the prioritized decision logic of `citizen_general_activities.py`.
-   Care must be taken to avoid conflicts if both engine-driven and API-driven activity creation are active for the same citizen.

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the `POST /api/actions/create-activity` endpoint (for direct creation of a single activity when all details are known) and `POST /api/activities/try-create` (for AI-initiated endeavors where the engine will build the necessary activity chain).

### Process:

1.  **Client-Side Decision**: The client (e.g., Kinos AI) determines the full details of the activity to be created. This includes:
    *   `citizenUsername`: The target citizen.
    *   `activityType`: The specific type of activity.
    *   `activityDetails`: A JSON object containing all necessary parameters for that activity type.
        *   For travel-related activities (e.g., `goto_work`, `goto_home`, `fetch_resource` from a specific building), the client should provide `toBuildingId` and `fromBuildingId` (if applicable) within `activityDetails`. The `/api/actions/create-activity` endpoint will then internally call `/api/transport` to determine the path and timing. The client no longer needs to provide `pathData`.
2.  **API Request**: The client sends a POST request to `/api/actions/create-activity` with the composed payload.
3.  **Server Validation & Pathfinding**: The API endpoint validates the payload. If it's a travel activity requiring pathfinding between specified buildings, the server attempts to find a path. If pathfinding fails, an error is returned.
4.  **Airtable Record Creation**: If validation and any necessary internal pathfinding succeed, a new activity record is created in the `ACTIVITIES` table with `Status: "created"`. The `Path`, `StartDate`, and `EndDate` fields are populated based on the pathfinding results.
5.  **Engine Processing**: The standard `processActivities.py` script will eventually pick up this "created" activity and execute its corresponding processor logic.

### Use Cases:

-   **Unguided AI**: Allows AI agents to have fine-grained control over their actions, enabling more complex or emergent behaviors.
-   **External Tools**: Could allow other tools or game masters to inject specific activities into the simulation.
-   **Player-Initiated Complex Actions (Future)**: Could potentially be used by the UI to initiate complex, multi-step actions that are best defined as a specific activity.

### Considerations:

-   The client (AI) is responsible for providing correct building IDs for travel. The server handles the pathfinding.
-   This method bypasses the prioritized decision logic of `citizen_general_activities.py`.
-   Care must be taken to avoid conflicts if both engine-driven and API-driven activity creation are active for the same citizen.

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the `POST /api/actions/create-activity` endpoint.
