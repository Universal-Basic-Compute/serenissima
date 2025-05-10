import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey }).base(baseId);

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    
    console.log(`Loading resource counts${owner ? ` for owner: ${owner}` : ' (all)'}`);
    
    // Build filter formula for Airtable query
    let filterFormula = '';
    if (owner) {
      filterFormula = `{Owner} = '${owner}'`;
      console.log(`Filtering resources by owner: ${owner}`);
    }
    
    // Query Airtable directly
    const records = await new Promise((resolve, reject) => {
      const allRecords: any[] = [];
      
      base('RESOURCES')
        .select({
          filterByFormula: filterFormula || '',
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
    
    // Create a map to aggregate resources by type
    const resourceCountMap = new Map<string, {
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
      
      // Create a unique key for this resource type
      const key = resourceType;
      
      if (resourceCountMap.has(key)) {
        // If we already have this resource type, increment the count
        const existingResource = resourceCountMap.get(key);
        existingResource.count += resourceCount;
      } else {
        // Otherwise, add a new entry
        resourceCountMap.set(key, {
          id: resourceId,
          name: resourceName,
          category: resourceCategory,
          subcategory: resourceSubcategory,
          icon: resourceIcon,
          count: resourceCount,
          rarity: resourceRarity,
          description: resourceDescription
        });
      }
    });
    
    // Convert map to array and sort by category and name
    const resourceCounts = Array.from(resourceCountMap.values())
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
    
    console.log(`Returning ${resourceCounts.length} unique resource types with counts`);
    
    return NextResponse.json({
      success: true,
      resourceCounts
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
