# Gestion des Contrats dans La Serenissima

Ce document explique le fonctionnement des contrats dans La Serenissima, un mécanisme clé pour les échanges économiques entre citoyens et entités.

## Types de Contrats

Il existe plusieurs types de contrats, chacun servant un objectif distinct dans l'économie du jeu :

1.  **`logistics_service_request`**:
    *   **Objectif**: Permettre aux citoyens/entreprises de commander des services de logistique (collecte et livraison de ressources) à un Porter Guild Hall.
    *   **Fonctionnement**:
        *   `Buyer`: Le client qui demande le service.
        *   `Seller`: L'opérateur du Porter Guild Hall.
        *   `SellerBuilding`: Le `BuildingId` du Porter Guild Hall.
        *   `BuyerBuilding`: Le `BuildingId` du bâtiment de destination du client où les ressources doivent être livrées.
        *   `ResourceType`: Peut être laissé vide. Le Porter Guild déterminera la ressource la moins stockée dans le `BuyerBuilding` du client et tentera de la fournir.
        *   `ServiceFeePerUnit`: Le montant que le `Buyer` paie au `Seller` par unité de ressource livrée avec succès.
        *   `TargetAmount`: Peut représenter un volume total de service sur la durée du contrat, ou être moins pertinent si le service est facturé par voyage/livraison.
        *   `Status`: `active`, `completed`, `failed`.
        *   `Notes`: Peut contenir des préférences du client ou des métriques de rentabilité pour le Porter Guild.
    *   **Logique Associée**:
        *   Le Porter (opérateur du `SellerBuilding`) identifie le contrat `logistics_service_request` le plus prioritaire/profitable.
        *   Le Porter évalue l'inventaire du `BuyerBuilding` du client pour déterminer la ressource la "moins stockée".
        *   Le Porter crée une activité `fetch_for_logistics_client` pour aller chercher cette ressource (jusqu'à sa capacité de 25 unités) auprès d'un vendeur public (`public_sell`) et la livrer au `BuyerBuilding`.
        *   Le `Buyer` (client) paie le vendeur de la ressource au moment de la collecte par le Porter.
        *   Le `Buyer` (client) paie le `ServiceFeePerUnit` au `Seller` (Porter Guild) à la livraison réussie au `BuyerBuilding`.

2.  **`import`**:
    *   **Objectif**: Faire venir des ressources de l'extérieur de Venise.
    *   **Fonctionnement**: Ces contrats sont généralement initiés par des citoyens (souvent des IA marchandes) ou des systèmes automatisés pour répondre à un besoin en ressources spécifiques.
    *   Le `Seller` est typiquement une entité externe (ex: "Italia"), et le `Buyer` est le citoyen ou l'entreprise qui importe.
    *   Le `SellerBuilding` est initialement nul et est assigné à une `merchant_galley` temporaire lors du traitement par `createimportactivities.py`.
    *   Le `TargetAmount` représente la quantité totale à importer.

3.  **`storage_rental` (Proposition)**:
    *   **Objectif**: Permettre aux citoyens de louer de l'espace de stockage dans les entrepôts d'autres citoyens.
    *   **Fonctionnement**:
        *   Un `Seller` (propriétaire/opérateur d'un bâtiment d'entreposage spécifique, identifié par `SellerBuilding`) offre une certaine capacité de stockage pour un `ResourceType` (type de ressource) également spécifique.
        *   Un `Buyer` (citoyen ayant besoin de stocker cette ressource) loue cet espace pour une durée déterminée (`EndAt`) et un prix convenu.
        *   Le `PricePerResource` (ou un champ similaire comme `PricePerCapacityPerPeriod`) est interprété comme le coût pour réserver une unité de capacité pour une période donnée (ex: par jour, par semaine). Ce prix est fixé par le `Seller` et peut naturellement varier en fonction de la valeur intrinsèque, du risque perçu, ou des conditions de stockage spécifiques associées au `ResourceType` (par exemple, stocker de l'or pourrait coûter plus cher par unité que stocker de la pierre).
        *   Le `TargetAmount` représente la capacité totale de stockage (nombre d'unités de `ResourceType`) que le `Buyer` loue.
        *   **Important**: Le `Buyer` paie pour la réservation de cette `TargetAmount` de capacité pour la `ResourceType` spécifiée dans le `SellerBuilding` pendant toute la durée du contrat, que l'espace soit effectivement utilisé (plein, partiellement plein ou vide) ou non. Les ressources stockées demeurent la propriété du `Buyer` mais sont physiquement situées dans le `SellerBuilding`. Ce modèle de tarification par ressource est préférable à un tarif forfaitaire unique par unité d'espace, car il permet une granularité qui reflète mieux la valeur et les spécificités de chaque bien stocké, enrichissant ainsi la dynamique économique.
        *   Les ressources stockées demeurent la propriété du `Buyer` mais sont physiquement situées dans le `SellerBuilding`.
    *   **Logique Associée**:
        *   Le `Buyer` (locataire) est responsable d'organiser le transport de ses ressources vers et depuis le `SellerBuilding` (l'entrepôt) en utilisant des activités comme `deliver_resource_batch` ou `fetch_resource`.
        *   Le personnel (Occupant) du `SellerBuilding` est employé par l'opérateur de l'entrepôt (`RunBy`) et est responsable de la maintenance générale, de la sécurité implicite et de la disponibilité de l'installation pour les locataires. Ils ne manipulent généralement pas directement les marchandises des locataires.
        *   Le système doit s'assurer que le `Buyer` ne dépasse pas la `TargetAmount` louée pour la `ResourceType` spécifiée dans le `SellerBuilding`.
        *   Les paiements du `Buyer` au `Seller` sont dus pour la capacité réservée, typiquement de manière récurrente (journalière, hebdomadaire) ou via un paiement initial pour toute la durée.
    *   **Implications Gameplay**:
        *   Crée un marché pour l'espace de stockage.
        *   Permet aux joueurs de spécialiser leurs bâtiments (production vs. stockage).
        *   Offre une flexibilité logistique (stockage avancé près des sources ou des marchés).
        *   Ajoute une source de revenu pour les propriétaires d'entrepôts.
        *   Nécessite une gestion attentive des capacités et des droits d'accès aux ressources stockées.
    *   **Stratégie de Prix pour `storage_rental`**:
        *   Le champ `PricePerResource` (ou `PricePerCapacityPerPeriod`) dans le contrat `storage_rental` représente le coût journalier pour stocker une unité de la `ResourceType` spécifiée.
        *   **Recommandation Générale**: Ce prix journalier pourrait se situer autour de **2% de la valeur marchande moyenne** de la ressource. Par exemple, si une unité de "Soie" vaut 200 Ducats, un coût de stockage journalier de 4 Ducats (2%) serait raisonnable. Étant donné que les ressources ont tendance à se déplacer relativement vite dans l'économie, ce taux vise à équilibrer la rentabilité pour le bailleur et un coût acceptable pour le locataire pour un stockage à court ou moyen terme.
        *   **Facteurs d'influence pour le `Seller` (bailleur)**:
            *   **Valeur de la ressource**: Les ressources plus précieuses peuvent justifier un pourcentage plus élevé en raison du risque accru.
            *   **Demande d'espace**: Une forte demande pour le stockage d'un type de ressource peut faire monter les prix.
            *   **Coûts opérationnels**: Le bailleur doit couvrir ses propres frais (maintenance de l'entrepôt, bail du terrain, etc.) et viser une marge bénéficiaire.
            *   **Conditions spéciales**: Si l'entrepôt offre des conditions particulières (ex: sécurité renforcée, température contrôlée - bien que non simulé en détail), cela peut justifier un prix plus élevé.
        *   **Impact sur le Gameplay**:
            *   Un coût de stockage bien calibré décourage l'accumulation excessive et indéfinie de ressources.
            *   Il introduit un coût d'opportunité pour la détention de stocks.
            *   Il crée un marché dynamique pour les services d'entreposage.
        *   Cette fourchette sert de guide pour l'équilibrage du jeu et le comportement des IA. Les joueurs humains restent libres de fixer leurs prix, mais des prix trop éloignés de ces normes pourraient être moins compétitifs.

3.  **`public_storage`**:
    *   **Objectif**: Permettre aux propriétaires d'entrepôts (gérés par l'IA) d'offrir publiquement de l'espace de stockage pour des types de ressources spécifiques.
    *   **Fonctionnement**:
        *   **Création**: Le script `backend/ais/automated_adjustpublicstoragecontracts.py` crée ces contrats quotidiennement.
        *   Pour chaque bâtiment de `SubCategory` "storage" géré par une IA :
            *   Il identifie les ressources stockables (`productionInformation.stores`) et la capacité totale (`productionInformation.storageCapacity`) du bâtiment.
            *   La capacité par type de ressource est calculée (capacité totale / nombre de types stockables) et multipliée par 5.
            *   Pour chaque ressource stockable, un contrat `public_storage` est créé (ou mis à jour).
            *   Le `ContractId` est déterministe : `public_storage_{BuildingId}_{ResourceType}`.
            *   Le `Seller` est l'opérateur (`RunBy`) de l'entrepôt.
            *   Le `SellerBuilding` est le `BuildingId` de l'entrepôt.
            *   Le `ResourceType` est la ressource spécifique offerte.
            *   Le `PricePerResource` est calculé comme un pourcentage (configurable via `--pricing`, par défaut 2% - "standard") du `importPrice` de la ressource, interprété comme un coût journalier par unité de capacité.
            *   Le `TargetAmount` est la capacité offerte pour cette ressource (calculée ci-dessus).
            *   `Status` est "active", `EndAt` est fixé à 1 semaine.
    *   **Utilisation**: Ces contrats sont consultés par le script `backend/ais/automated_adjuststoragequeriescontracts.py` pour trouver des lieux de stockage.

4.  **`storage_query`**:
    *   **Objectif**: Permettre aux bâtiments commerciaux gérés par l'IA de rechercher et de réserver de l'espace de stockage externe lorsque leur propre capacité est presque pleine.
    *   **Fonctionnement**:
        *   **Création**: Le script `backend/ais/automated_adjuststoragequeriescontracts.py` crée ces contrats.
        *   Pour chaque bâtiment de `Category` "business" géré par une IA :
            *   Si sa capacité de stockage actuelle dépasse 90% :
                *   Il calcule le volume à décharger pour revenir à 50%.
                *   Pour chaque ressource stockée, il recherche des contrats `public_storage` actifs.
                *   Les offres `public_storage` sont classées par un score (`PricePerResource^2 * distance`).
                *   Pour les meilleures offres, des contrats `storage_query` sont créés.
                *   Le `ContractId` est unique : `storage_query_{BuildingIdDuBatBusiness}_{ResourceType}_{UUID}`.
                *   `Buyer`: L'opérateur du bâtiment "business".
                *   `BuyerBuilding`: Le `BuildingId` du bâtiment "business".
                *   `Seller`: L'opérateur de l'entrepôt offrant le `public_storage`.
                *   `SellerBuilding`: Le `BuildingId` de l'entrepôt.
                *   `ResourceType`: La ressource à stocker.
                *   `PricePerResource`: Copié du contrat `public_storage`.
                *   `TargetAmount`: Quantité à stocker, limitée par le besoin, la ressource disponible chez le `Buyer`, et la capacité offerte par le `public_storage`.
                *   `Status` est "active", `EndAt` est fixé à 1 mois.
        *   **Paiement**: Le script `backend/engine/paystoragecontracts.py` gère les paiements journaliers pour ces contrats. Le `Buyer` paie le `Seller` pour la `TargetAmount` réservée, que l'espace soit utilisé ou non.
    *   **Logique Associée**:
        *   Le `Buyer` (opérateur du bâtiment commercial) doit organiser le transport des ressources vers le `SellerBuilding` (entrepôt) en utilisant une activité `deliver_to_storage`.
        *   De même, pour récupérer ses ressources, le `Buyer` utilisera une activité `fetch_from_storage` depuis le `SellerBuilding` vers son bâtiment commercial.
        *   Le système doit s'assurer que le `Buyer` ne dépasse pas la `TargetAmount` louée pour la `ResourceType` dans le `SellerBuilding` (la logique de vérification de capacité est dans le processeur de `deliver_to_storage`).
        *   Les ressources stockées dans le `SellerBuilding` sous un contrat `storage_query` restent la propriété du `Buyer`.

5.  **`construction_project`**:
    *   **Objectif**: Gérer la construction d'un nouveau bâtiment.
    *   **Fonctionnement**:
            *   **Demande d'espace**: Une forte demande pour le stockage d'un type de ressource peut faire monter les prix.
            *   **Coûts opérationnels**: Le bailleur doit couvrir ses propres frais (maintenance de l'entrepôt, bail du terrain, etc.) et viser une marge bénéficiaire.
            *   **Conditions spéciales**: Si l'entrepôt offre des conditions particulières (ex: sécurité renforcée, température contrôlée - bien que non simulé en détail), cela peut justifier un prix plus élevé.
        *   **Impact sur le Gameplay**:
            *   Un coût de stockage bien calibré décourage l'accumulation excessive et indéfinie de ressources.
            *   Il introduit un coût d'opportunité pour la détention de stocks.
            *   Il crée un marché dynamique pour les services d'entreposage.
        *   Cette fourchette sert de guide pour l'équilibrage du jeu et le comportement des IA. Les joueurs humains restent libres de fixer leurs prix, mais des prix trop éloignés de ces normes pourraient être moins compétitifs.

5.  **`construction_project`**:
    *   **Objectif**: Gérer la construction d'un nouveau bâtiment.
    *   **Fonctionnement**:
        *   Créé lorsqu'un nouveau bâtiment est commandé (par IA ou joueur).
        *   `Buyer`: Le citoyen/entité qui commande la construction et deviendra propriétaire.
        *   `Seller`: L'opérateur de l'atelier de construction.
        *   `BuyerBuilding`: Le `BuildingId` du bâtiment en cours de construction (qui a `IsConstructed=False`).
        *   `SellerBuilding`: Le `BuildingId` de l'atelier de construction responsable.
        *   `ResourceType`: Non directement applicable ici, les ressources sont définies par les `constructionCosts` du type de bâtiment cible. Ces coûts sont également stockés dans le champ `Notes` du contrat au format JSON (ex: `{"constructionCosts": {"timber": 100, "stone": 50}}`).
        *   `TargetAmount`: Non directement applicable. La "quantité" est la complétion du bâtiment.
        *   `Status`: Peut être `pending_materials`, `materials_delivered`, `construction_in_progress`, `completed`, `failed`.
        *   `Notes` (Texte multiligne): Contient un objet JSON avec une clé `constructionCosts` listant les matériaux nécessaires, et un `delivery_log` pour suivre les livraisons.
    *   **Logique Associée**:
        *   Les ouvriers de `SellerBuilding` exécutent des activités `deliver_construction_materials` vers `BuyerBuilding`.
        *   Une fois les matériaux livrés, ils exécutent des activités `construct_building` sur `BuyerBuilding`.
        *   Le champ `ConstructionMinutesRemaining` sur l'enregistrement du `BuyerBuilding` est décrémenté.
        *   Lorsque `ConstructionMinutesRemaining` <= 0, le bâtiment est marqué `IsConstructed=True` et le contrat `completed`.

6.  **`recurrent`**:
    *   **Objectif**: Établir des échanges commerciaux réguliers et pré-arrangés entre deux parties spécifiques.
    *   **Fonctionnement**: Un `Buyer` et un `Seller` (citoyens ou leurs entreprises via `BuyerBuilding` et `SellerBuilding`) s'accordent sur la livraison répétée d'une `ResourceType`.
    *   Le `TargetAmount` spécifie la quantité à échanger lors de chaque transaction déclenchée par ce contrat (remplace l'ancien concept de `HourlyAmount`).
    *   Ces contrats ont une `Priority` qui peut influencer l'ordre dans lequel un citoyen tente de les satisfaire.
    *   Utilisé par les citoyens pour s'assurer un approvisionnement régulier pour leurs activités de production.

7.  **`public_sell`**:
    *   **Objectif**: Permettre aux entreprises de vendre des ressources sur un marché ouvert, accessible à tout acheteur éligible.
    *   **Fonctionnement**:
        *   **Création**: Les entreprises (gérées par des IA ou des joueurs) peuvent créer des contrats `public_sell` pour les ressources qu'elles produisent ou souhaitent vendre. Le script `backend/ais/automated_managepublicsalesandprices.py` et `backend/ais/managepublicsalesandprices.py` (piloté par Kinos) gèrent cela pour les IA (voir [documentation IA](ais.md)).
        *   Le `Seller` est l'opérateur de l'entreprise vendeuse, et `SellerBuilding` est l'identifiant du bâtiment vendeur.
        *   Le `Buyer` est initialement "public".
        *   Le `TargetAmount` représente la quantité de la ressource que le vendeur met à disposition pour la vente via ce contrat. Pour qu'un achat puisse avoir lieu, ce montant doit être supérieur à zéro. Il est décrémenté à chaque achat. Sa gestion (initialisation, réapprovisionnement) dépend du mécanisme de création du contrat (manuel, IA automatisée, IA Kinos).
        *   La `PricePerResource` est fixée par le vendeur.
    *   **Découverte et Achat (Logique dans `citizen_general_activities.py`)**:
        *   **Déclencheur**: Lorsqu'un lieu de travail (géré par un citoyen, IA ou joueur) a besoin d'une ressource pour une recette de production et qu'aucun contrat `recurrent` approprié n'est disponible ou exécutable.
        *   **Sélection**: Le système évalue les contrats `public_sell` actifs pour la ressource manquante. La sélection du contrat à utiliser est basée sur un score calculé pour chaque offre éligible (le vendeur doit avoir du stock) :
            ```
            Score = (PricePerResource * 2) + Distance - TrustScore
            ```
            *   `PricePerResource`: Le prix unitaire de la ressource indiqué dans le contrat `public_sell`.
            *   `Distance`: La distance à vol d'oiseau entre le bâtiment de l'acheteur (lieu de travail ayant besoin de la ressource) et le `SellerBuilding` du contrat `public_sell`.
            *   `TrustScore`: Un score de confiance numérique récupéré depuis la table `RELATIONSHIPS`. Il est recherché entre le `RunBy` du bâtiment de l'acheteur et le `RunBy` (ou `Owner` en fallback) du `SellerBuilding`. Un score plus élevé indique une meilleure relation, réduisant ainsi le score global du contrat (le rendant plus attractif).
            *   Le contrat avec le **score le plus bas** est privilégié.
        *   **Transaction**:
            *   Une activité `fetch_resource` est créée pour un citoyen (généralement l'occupant du lieu de travail) pour aller chercher la ressource.
            *   La quantité à acheter (`Amount` dans l'activité `fetch_resource`) est déterminée par le minimum entre : le besoin net de la recette, la quantité disponible dans le contrat `public_sell` (champ `TargetAmount`), la capacité de transport du citoyen, et les fonds disponibles de l'opérateur du lieu de travail (l'acheteur effectif).
            *   Lors du traitement de l'activité `fetch_resource` (par `fetch_resource_processor.py`), le paiement est effectué par l'opérateur du `ToBuilding` de l'activité (le lieu de travail) au `Seller` du contrat (l'opérateur du `SellerBuilding`).

## Cycle de Vie d'un Contrat

-   **`CreatedAt`**: Date et heure de création du contrat.
-   **`EndAt`**: Date et heure auxquelles le contrat expire et n'est plus considéré comme actif. Pour les contrats `public_sell` créés par `automated_managepublicsalesandprices.py`, cette durée est typiquement de 47 heures.
-   **`Status`**: Peut indiquer si un contrat est `active`, `completed`, `failed`, ou `ended_by_ai`.
-   **`LastExecutedAt`**: Utilisé par certains types de contrats (ex: `import` traités par `fetch_from_galley`) pour marquer la dernière fois qu'une partie du contrat a été exécutée.

## Champs Clés de la Table `CONTRACTS`

Voir la [documentation du schéma Airtable](airtable_schema.md#table-contracts) pour une description détaillée des champs. Les points importants relatifs à la logique ci-dessus incluent :
-   `Type`: `import`, `recurrent`, `public_sell`, `construction_project`, `public_storage`, `storage_query` (et potentiellement `storage_rental`).
-   `Buyer`, `Seller`: Usernames des citoyens.
-   `BuyerBuilding`, `SellerBuilding`: `BuildingId` personnalisés des bâtiments impliqués.
-   `TargetAmount`: Quantité totale (pour `import`, `public_sell`) ou par transaction (pour `recurrent`). Pour `logistics_service_request`, peut être moins pertinent ou représenter un volume total de service.
-   `PricePerResource`: Prix unitaire. Pour `logistics_service_request`, utiliser `ServiceFeePerUnit`.
-   `ContractId`: Identifiant unique, souvent déterministe pour faciliter les mises à jour.
```
```

```markdown
backend/docs/airtable_schema.md
<<<<<<< SEARCH
-   `TargetAmount` (Nombre): Quantité horaire de ressource pour ce contrat.
-   `PricePerResource` (Nombre): Prix unitaire de la ressource.
-   `Priority` (Nombre): Priorité du contrat.
-   `Status` (Texte): Statut du contrat (ex: `active`, `completed`, `failed`).
