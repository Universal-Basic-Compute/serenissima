import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey }).base(baseId);

// Helper function to convert resource name to icon filename
function getResourceIconFromName(resourceName: string): string {
  // Convert the resource name to lowercase, replace spaces with underscores
  const formattedName = resourceName.toLowerCase().replace(/\s+/g, '_');
  
  // Return the formatted name with .png extension
  return `${formattedName}.png`;
}

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    
    console.log(`Loading resource counts${owner ? ` for owner: ${owner}` : ' (all)'}`);
    
    // Query Airtable directly
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base('RESOURCES')
        .select({
          view: 'Grid view'
        })
        .eachPage(
          function page(records, fetchNextPage) {
            records.forEach(record => {
              allRecords.push(record);
            });
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              console.error('Error fetching resources from Airtable:', err);
              reject(err);
              return;
            }
            resolve(allRecords);
          }
        );
    });
    
    // Create maps to aggregate resources by type - one for player resources, one for global
    const playerResourceMap = new Map<string, {
      id: string;
      name: string;
      category: string;
      subcategory: string;
      icon: string;
      count: number;
      rarity: string;
      description: string;
    }>();
    
    const globalResourceMap = new Map<string, {
      id: string;
      name: string;
      category: string;
      subcategory: string;
      icon: string;
      count: number;
      rarity: string;
      description: string;
    }>();
    
    // Process records to count resources by type
    (records as any[]).forEach(record => {
      const resourceId = record.get('ResourceId');
      const resourceType = record.get('Type');
      const resourceName = record.get('Name') || resourceType;
      const resourceCategory = record.get('Category') || 'raw_materials';
      const resourceSubcategory = record.get('Subcategory') || '';
      const resourceCount = record.get('Count') || 1;
      const resourceIcon = record.get('Icon') || 'default.png';
      const resourceRarity = record.get('Rarity') || 'common';
      const resourceDescription = record.get('Description') || '';
      const resourceOwner = record.get('Owner') || '';
      
      // Generate icon filename from resource name
      const iconFromName = getResourceIconFromName(resourceName);
      
      // Create a unique key for this resource type
      const key = resourceType;
      
      // Add to global resource map
      if (globalResourceMap.has(key)) {
        // If we already have this resource type, increment the count
        const existingResource = globalResourceMap.get(key);
        existingResource.count += resourceCount;
      } else {
        // Otherwise, add a new entry
        globalResourceMap.set(key, {
          id: resourceId,
          name: resourceName,
          category: resourceCategory,
          subcategory: resourceSubcategory,
          icon: iconFromName,
          count: resourceCount,
          rarity: resourceRarity,
          description: resourceDescription
        });
      }
      
      // Add to player resource map if it belongs to the specified owner
      if (owner && resourceOwner === owner) {
        if (playerResourceMap.has(key)) {
          // If we already have this resource type, increment the count
          const existingResource = playerResourceMap.get(key);
          existingResource.count += resourceCount;
        } else {
          // Otherwise, add a new entry
          playerResourceMap.set(key, {
            id: resourceId,
            name: resourceName,
            category: resourceCategory,
            subcategory: resourceSubcategory,
            icon: iconFromName,
            count: resourceCount,
            rarity: resourceRarity,
            description: resourceDescription
          });
        }
      }
    });
    
    // Convert maps to arrays and sort by category and name
    const globalResourceCounts = Array.from(globalResourceMap.values())
      .sort((a, b) => {
        // First sort by category
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        // Then by subcategory
        if (a.subcategory !== b.subcategory) {
          return a.subcategory.localeCompare(b.subcategory);
        }
        // Finally by name
        return a.name.localeCompare(b.name);
      });
    
    const playerResourceCounts = Array.from(playerResourceMap.values())
      .sort((a, b) => {
        // First sort by category
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        // Then by subcategory
        if (a.subcategory !== b.subcategory) {
          return a.subcategory.localeCompare(b.subcategory);
        }
        // Finally by name
        return a.name.localeCompare(b.name);
      });
    
    console.log(`Returning ${globalResourceCounts.length} global resource types and ${playerResourceCounts.length} player resource types`);
    
    // Log sample resource data for debugging
    console.log('Sample global resource data being returned:');
    console.log(globalResourceCounts.slice(0, 3).map(r => ({
      name: r.name,
      icon: r.icon,
      category: r.category
    })));
    
    return NextResponse.json({
      success: true,
      globalResourceCounts,
      playerResourceCounts
    });
  } catch (error) {
    console.error('Error loading resource counts:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load resource counts',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
