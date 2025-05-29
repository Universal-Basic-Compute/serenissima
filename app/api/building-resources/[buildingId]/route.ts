import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import path from 'path';

// Helper function to extract buildingId from the request URL
function extractBuildingIdFromRequest(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/building-resources\/([^/]+)/);
  return match?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    // Extract buildingId from the URL
    const buildingId = extractBuildingIdFromRequest(request);
    
    if (!buildingId) {
      return NextResponse.json(
        { success: false, error: 'Building ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching comprehensive resource information for building: ${buildingId}`);
    
    // Determine if we're running in Node.js or browser environment
    const isNode = typeof window === 'undefined';
    
    // Set base URL depending on environment
    const baseUrl = isNode 
      ? (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
      : '';
    
    // 1. Fetch building details to get owner and type information
    console.log(`Fetching building details for: ${buildingId}`);
    const buildingResponse = await fetch(`${baseUrl}/api/buildings/${buildingId}`);
    
    if (!buildingResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch building details: ${buildingResponse.status}` },
        { status: buildingResponse.status }
      );
    }
    
    const buildingData = await buildingResponse.json();
    const building = buildingData.building;
    
    if (!building) {
      return NextResponse.json(
        { success: false, error: 'Building not found' },
        { status: 404 }
      );
    }
    
    // 2. Fetch contracts for this building
    console.log(`Fetching contracts for building: ${buildingId}`);
    const contractsResponse = await fetch(`${baseUrl}/api/contracts?sellerBuilding=${encodeURIComponent(buildingId)}`);
    
    let contracts = [];
    if (contractsResponse.ok) {
      const contractsData = await contractsResponse.json();
      contracts = contractsData.success && contractsData.contracts ? contractsData.contracts : [];
      console.log(`Found ${contracts.length} contracts for building ${buildingId}`);
    } else {
      console.warn(`Failed to fetch contracts: ${contractsResponse.status}`);
    }
    
    // 3. Fetch resource types for reference information
    console.log(`Fetching resource types`);
    const resourceTypesResponse = await fetch(`${baseUrl}/api/resource-types`);
    
    let resourceTypes = [];
    if (resourceTypesResponse.ok) {
      const resourceTypesData = await resourceTypesResponse.json();
      resourceTypes = resourceTypesData.success && resourceTypesData.resourceTypes ? resourceTypesData.resourceTypes : [];
      console.log(`Found ${resourceTypes.length} resource types`);
    } else {
      console.warn(`Failed to fetch resource types: ${resourceTypesResponse.status}`);
    }
    
    // 4. Fetch resource counts for this building
    console.log(`Fetching resource counts for building: ${buildingId}`);
    const resourceCountsResponse = await fetch(`${baseUrl}/api/resources/counts?buildingId=${encodeURIComponent(buildingId)}`);
    
    let storedResources = [];
    if (resourceCountsResponse.ok) {
      const resourceCountsData = await resourceCountsResponse.json();
      storedResources = resourceCountsData.success && resourceCountsData.buildingResourceCounts 
        ? resourceCountsData.buildingResourceCounts 
        : [];
      console.log(`Found ${storedResources.length} stored resources for building ${buildingId}`);
    } else {
      console.warn(`Failed to fetch resource counts: ${resourceCountsResponse.status}`);
    }
    
    // 5. Fetch building definition to get production information
    console.log(`Fetching building definition for type: ${building.type}`);
    const buildingDefResponse = await fetch(`${baseUrl}/api/building-definition?type=${encodeURIComponent(building.type)}`);
    
    let buildingDefinition = null;
    if (buildingDefResponse.ok) {
      buildingDefinition = await buildingDefResponse.json();
      console.log(`Found building definition for type ${building.type}`);
    } else {
      console.warn(`Failed to fetch building definition: ${buildingDefResponse.status}`);
    }
    
    // 6. Process and organize the data
    
    // 6.1 Publicly sold resources (from contracts)
    const publiclySoldResources = contracts
      .filter(contract => contract.type === 'public_sell')
      .map(contract => {
        // Find matching resource type for additional info
        const resourceType = resourceTypes.find(rt => rt.id === contract.resourceType || rt.name === contract.resourceType);
        
        return {
          id: contract.id,
          resourceType: contract.resourceType,
          name: resourceType?.name || contract.resourceType,
          category: resourceType?.category || 'unknown',
          targetAmount: contract.targetAmount || 0,
          price: contract.price || contract.PricePerResource || 0, // PricePerResource is from Airtable
          transporter: contract.transporter || contract.Transporter || null, // Transporter is from Airtable
          icon: resourceType?.icon || `${contract.resourceType.toLowerCase().replace(/\s+/g, '_')}.png`,
          description: resourceType?.description || '',
          importPrice: resourceType?.importPrice !== undefined ? resourceType.importPrice : null, // Added importPrice
          contractType: 'public_sell'
        };
      });
    
    // 6.2 Stored resources (from resource counts)
    const enhancedStoredResources = storedResources.map(resource => {
      // Find matching resource type for additional info
      const resourceType = resourceTypes.find(rt => rt.id === resource.type || rt.name === resource.type);
      
      return {
        ...resource,
        name: resourceType?.name || resource.name || resource.type,
        category: resourceType?.category || resource.category || 'unknown',
        icon: resourceType?.icon || resource.icon || `${resource.type.toLowerCase().replace(/\s+/g, '_')}.png`,
        description: resourceType?.description || resource.description || ''
      };
    });
    
    // 6.3 Resources the building can buy (from building definition)
    const boughtResources = [];
    if (buildingDefinition?.productionInformation?.inputResources) {
      Object.entries(buildingDefinition.productionInformation.inputResources).forEach(([resourceId, amount]) => {
        // Find matching resource type for additional info
        const resourceType = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId);
        
        boughtResources.push({
          resourceType: resourceId,
          name: resourceType?.name || resourceId,
          category: resourceType?.category || 'unknown',
          amount: amount,
          icon: resourceType?.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
          description: resourceType?.description || ''
        });
      });
    }
    
    // 6.4 Resources the building can sell (from building definition and contracts)
    const sellableResourcesMap = new Map<string, any>();

    // Helper to add/update sellable resource
    const addOrUpdateSellable = (resourceId: string, baseInfo: any, contractPrice?: number) => {
      const existing = sellableResourcesMap.get(resourceId);
      const resourceTypeInfo = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId) || {};
      
      const entry = {
        resourceType: resourceId,
        name: resourceTypeInfo.name || baseInfo.name || resourceId,
        category: resourceTypeInfo.category || baseInfo.category || 'unknown',
        icon: resourceTypeInfo.icon || baseInfo.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
        description: resourceTypeInfo.description || baseInfo.description || '',
        importPrice: resourceTypeInfo.importPrice !== undefined ? resourceTypeInfo.importPrice : (baseInfo.importPrice !== undefined ? baseInfo.importPrice : null),
        amount: baseInfo.amount, // from outputResources if applicable
        // Preserve existing price if already set (e.g. from a previous contract for the same item),
        // but allow contractPrice to override if provided.
        price: contractPrice !== undefined ? contractPrice : existing?.price 
      };
      sellableResourcesMap.set(resourceId, entry);
    };

    // Populate from building definition (sells array/object)
    if (buildingDefinition?.productionInformation?.sells) {
      const sellsDef = buildingDefinition.productionInformation.sells;
      if (Array.isArray(sellsDef)) {
        sellsDef.forEach(resourceId => addOrUpdateSellable(resourceId, {}));
      } else if (typeof sellsDef === 'object' && sellsDef !== null) {
        Object.keys(sellsDef).forEach(resourceId => addOrUpdateSellable(resourceId, {}));
      }
    }

    // Populate from building definition (outputResources)
    if (buildingDefinition?.productionInformation?.outputResources) {
      Object.entries(buildingDefinition.productionInformation.outputResources).forEach(([resourceId, amount]) => {
        const existing = sellableResourcesMap.get(resourceId);
        if (!existing) { 
          addOrUpdateSellable(resourceId, { amount });
        } else if (existing.amount === undefined && amount !== undefined) {
            existing.amount = amount; // Update amount if it was from 'sells' which doesn't have amount
            sellableResourcesMap.set(resourceId, existing);
        }
      });
    }
    
    // Now, iterate over publiclySoldResources (contracts) and update/add price information
    publiclySoldResources.forEach(contract => {
      const resourceId = contract.resourceType;
      const contractPrice = contract.price; // This is the price from the contract
      
      // Use addOrUpdateSellable, passing the contract price.
      // This will either update an existing entry (from definition) with the contract price,
      // or add a new entry if it wasn't in the definition but has a public sell contract.
      addOrUpdateSellable(resourceId, {
        name: contract.name, // Base info from contract if new
        category: contract.category,
        icon: contract.icon,
        description: contract.description,
        importPrice: contract.importPrice // contract object should already be enriched
      }, contractPrice);
    });

    const sellableResources = Array.from(sellableResourcesMap.values());
    
    // 6.5 Resources the building can store (from building definition)
    const storableResources = [];
    // Check multiple possible locations for storable resources
    if (buildingDefinition?.productionInformation?.stores) {
      // Handle array format
      if (Array.isArray(buildingDefinition.productionInformation.stores)) {
        buildingDefinition.productionInformation.stores.forEach(resourceId => {
          // Find matching resource type for additional info
          const resourceType = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId);
          
          storableResources.push({
            resourceType: resourceId,
            name: resourceType?.name || resourceId,
            category: resourceType?.category || 'unknown',
            icon: resourceType?.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
            description: resourceType?.description || '',
            importPrice: resourceType?.importPrice !== undefined ? resourceType.importPrice : null
          });
        });
      } 
      // Handle object format with resource IDs as keys
      else if (typeof buildingDefinition.productionInformation.stores === 'object') {
        Object.keys(buildingDefinition.productionInformation.stores).forEach(resourceId => {
          // Find matching resource type for additional info
          const resourceType = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId);
          
          storableResources.push({
            resourceType: resourceId,
            name: resourceType?.name || resourceId,
            category: resourceType?.category || 'unknown',
            icon: resourceType?.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
            description: resourceType?.description || '',
            importPrice: resourceType?.importPrice !== undefined ? resourceType.importPrice : null
          });
        });
      }
    }
    
    // Also check if the building can store what it sells or buys
    if (sellableResources.length > 0 && storableResources.length === 0) {
      // If the building sells resources but has no explicit storage, assume it can store what it sells
      sellableResources.forEach(resource => {
        // Skip if we already have this resource
        if (storableResources.some(r => r.resourceType === resource.resourceType)) {
          return;
        }
        
        storableResources.push({...resource});
      });
    }
    
    if (boughtResources.length > 0 && storableResources.length === 0) {
      // If the building buys resources but has no explicit storage, assume it can store what it buys
      boughtResources.forEach(resource => {
        // Skip if we already have this resource
        if (storableResources.some(r => r.resourceType === resource.resourceType)) {
          return;
        }
        
        storableResources.push({...resource});
      });
    }
    
    // If we have public contracts but no storable resources, add the contract resources as storable
    if (storableResources.length === 0 && publiclySoldResources.length > 0) {
      publiclySoldResources.forEach(contract => {
        // Find matching resource type for importPrice
        const resourceType = resourceTypes.find(rt => rt.id === contract.resourceType || rt.name === contract.resourceType);
        storableResources.push({
          resourceType: contract.resourceType,
          name: contract.name,
          category: contract.category,
          icon: contract.icon,
          description: contract.description,
          importPrice: resourceType?.importPrice !== undefined ? resourceType.importPrice : null
        });
      });
    }
    
    // 6.6 Transformation recipes (from building definition)
    const transformationRecipes = [];
    // Check multiple possible locations for recipes
    const recipeLocations = [
      buildingDefinition?.productionInformation?.Arti,
      buildingDefinition?.productionInformation?.recipes,
      buildingDefinition?.recipes
    ];
    
    for (const recipeLocation of recipeLocations) {
      if (Array.isArray(recipeLocation)) {
        recipeLocation.forEach((recipe, index) => {
          const inputs = [];
          const outputs = [];
          
          // Process inputs
          if (recipe.inputs) {
            Object.entries(recipe.inputs).forEach(([resourceId, amount]) => {
              // Find matching resource type for additional info
              const resourceType = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId);
              
              inputs.push({
                resourceType: resourceId,
                name: resourceType?.name || resourceId,
                category: resourceType?.category || 'unknown',
                amount: amount,
                icon: resourceType?.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
                description: resourceType?.description || ''
              });
            });
          }
          
          // Process outputs
          if (recipe.outputs) {
            Object.entries(recipe.outputs).forEach(([resourceId, amount]) => {
              // Find matching resource type for additional info
              const resourceType = resourceTypes.find(rt => rt.id === resourceId || rt.name === resourceId);
              
              outputs.push({
                resourceType: resourceId,
                name: resourceType?.name || resourceId,
                category: resourceType?.category || 'unknown',
                amount: amount,
                icon: resourceType?.icon || `${resourceId.toLowerCase().replace(/\s+/g, '_')}.png`,
                description: resourceType?.description || ''
              });
            });
          }
          
          transformationRecipes.push({
            id: `recipe-${index}`,
            inputs,
            outputs,
            craftMinutes: recipe.craftMinutes || 0
          });
        });
      }
    }
    
    // Add debug logging
    console.log(`Processed building definition for ${building.type}:`);
    console.log(`- Bought resources: ${boughtResources.length}`);
    console.log(`- Sellable resources: ${sellableResources.length}`);
    console.log(`- Storable resources: ${storableResources.length}`);
    console.log(`- Transformation recipes: ${transformationRecipes.length}`);
    
    // Calculate total storage used
    const totalStorageUsed = enhancedStoredResources.reduce((sum, resource) => {
      return sum + (resource.amount || 0);
    }, 0);
    
    // 7. Return the comprehensive building resource information
    return NextResponse.json({
      success: true,
      buildingId,
      buildingType: building.type,
      buildingName: buildingDefinition?.name || building.type,
      category: buildingDefinition?.category || null,
      subCategory: buildingDefinition?.subCategory || null,
      canImport: buildingDefinition?.canImport || false,
      constructionCosts: buildingDefinition?.constructionCosts || null,
      consumeTier: buildingDefinition?.consumeTier !== undefined ? buildingDefinition.consumeTier : (buildingDefinition?.buildTier !== undefined ? buildingDefinition.buildTier : null), // Fallback to buildTier if consumeTier is not present
      owner: building.owner,
      resources: {
        stored: enhancedStoredResources,
        publiclySold: publiclySoldResources,
        bought: boughtResources,
        sellable: sellableResources,
        storable: storableResources,
        transformationRecipes
      },
      storage: {
        used: totalStorageUsed,
        capacity: buildingDefinition?.productionInformation?.storageCapacity || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching building resources:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch building resources',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
