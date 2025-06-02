import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  // Initialize Airtable with requestTimeout
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

// Utility function to convert field names to camelCase
function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert first character to lowercase for the new key
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
  }
  
  return result;
}

export async function GET(request: Request) {
  try {
    // Initialize Airtable
    const base = initAirtable();
    
    console.log('Fetching top 10 citizens by influence...');
    
    // Fetch citizens from Airtable, sorted by Influence in descending order
    const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{InVenice} = TRUE()', // Only include citizens in Venice
        sort: [{ field: 'Influence', direction: 'desc' }],
        maxRecords: 10 // Limit to top 10
      })
      .all();
    
    // Transform Airtable records to our citizen format
    const topCitizens = citizenRecords.map(record => {
      // Get all fields from Airtable (PascalCase) and convert their keys to camelCase
      const camelCaseFields = toCamelCase(record.fields);
      
      // Create citizen object with required fields for the Signoria display
      return {
        username: camelCaseFields.username || '',
        firstName: camelCaseFields.firstName || '',
        lastName: camelCaseFields.lastName || '',
        influence: camelCaseFields.influence || 0,
        socialClass: camelCaseFields.socialClass || '',
        coatOfArmsImageUrl: camelCaseFields.coatOfArmsImageUrl || null,
        familyMotto: camelCaseFields.familyMotto || '',
        // Additional fields that might be useful
        ducats: camelCaseFields.ducats || 0,
        isAi: camelCaseFields.isAi || false
      };
    });
    
    return NextResponse.json({
      success: true,
      citizens: topCitizens
    });
    
  } catch (error) {
    console.error('Error fetching top influence citizens:', error);
    
    // Return a fallback with sample citizens
    const sampleTopCitizens = [
      {
        username: "doge_andrea",
        firstName: "Andrea",
        lastName: "Gritti",
        influence: 25000,
        socialClass: "Nobili",
        coatOfArmsImageUrl: "https://backend.serenissima.ai/public/assets/images/coat-of-arms/doge_andrea.png",
        familyMotto: "Fortitudine et Prudentia",
        ducats: 500000,
        isAi: true
      },
      {
        username: "lorenzo_medici",
        firstName: "Lorenzo",
        lastName: "de' Medici",
        influence: 22500,
        socialClass: "Nobili",
        coatOfArmsImageUrl: "https://backend.serenissima.ai/public/assets/images/coat-of-arms/lorenzo_medici.png",
        familyMotto: "Arte et Ingenio",
        ducats: 450000,
        isAi: true
      }
      // More fallback citizens would be here in a real implementation
    ];
    
    return NextResponse.json({
      success: true,
      citizens: sampleTopCitizens,
      _fallback: true // Indicate that fallback data is used
    });
  }
}
