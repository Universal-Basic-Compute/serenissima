import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the building type from the query parameters
    const url = new URL(request.url);
    const buildingType = url.searchParams.get('type');
    
    if (!buildingType) {
      return NextResponse.json(
        { error: 'Building type is required' },
        { status: 400 }
      );
    }
    
    // Use the building-types API to get all building types
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    
    const buildingTypesUrl = new URL('/api/building-types', baseUrl);
    console.log(`Fetching building types from: ${buildingTypesUrl.toString()}`);
    
    const response = await fetch(buildingTypesUrl.toString());
    
    if (!response.ok) {
      console.error(`Failed to fetch building types: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch building types' },
        { status: 500 }
      );
    }
    
    const data = await response.json();
    
    if (!data.success || !data.buildingTypes) {
      console.error('Invalid response from building-types API');
      return NextResponse.json(
        { error: 'Invalid response from building-types API' },
        { status: 500 }
      );
    }
    
    // Normalize the requested building type for comparison
    const normalizedRequestType = buildingType.toLowerCase().trim().replace(/\s+/g, '_');
    
    // First try exact match
    let matchedBuilding = data.buildingTypes.find(bt => 
      bt.type.toLowerCase().trim().replace(/\s+/g, '_') === normalizedRequestType
    );
    
    // If no exact match, try partial match
    if (!matchedBuilding) {
      matchedBuilding = data.buildingTypes.find(bt => {
        const normalizedType = bt.type.toLowerCase().trim().replace(/\s+/g, '_');
        return normalizedType.includes(normalizedRequestType) || 
               normalizedRequestType.includes(normalizedType);
      });
    }
    
    // If still no match, return a default building definition
    if (!matchedBuilding) {
      console.log(`No matching building type found for: ${buildingType}, returning default`);
      
      // Create a default building definition
      const defaultDefinition = {
        type: buildingType,
        name: buildingType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        category: 'commercial',
        subCategory: 'general',
        tier: 1,
        constructionCosts: null,
        maintenanceCost: 0,
        shortDescription: `A ${buildingType.replace(/_/g, ' ')} building.`,
        productionInformation: {
          storageCapacity: 1000,
          stores: ["general_goods"],
          sells: ["general_goods"]
        },
        canImport: true
      };
      
      return NextResponse.json(defaultDefinition);
    }
    
    // Return the matched building definition
    return NextResponse.json(matchedBuilding);
    
  } catch (error) {
    console.error('Error in GET /api/building-definition:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building definition' },
      { status: 500 }
    );
  }
}
