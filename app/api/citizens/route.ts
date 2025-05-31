import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = 'BUILDINGS';
const AIRTABLE_GUILDS_TABLE = 'GUILDS'; // Added GUILDS table

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

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  // Initialize Airtable with requestTimeout
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

export async function GET(request: Request) {
  try {
    // Initialize Airtable
    const base = initAirtable();
    const url = new URL(request.url);

    const formulaParts: string[] = ["{inVenice} = TRUE()"]; // Base filter
    const loggableFilters: Record<string, string> = { inVenice: "TRUE()" };
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection']; // Parameters handled by pagination/sorting logic

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key; // Assuming query param key IS the Airtable field name
      loggableFilters[airtableField] = value;

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && numValue.toString() === value) {
        formulaParts.push(`{${airtableField}} = ${value}`);
      } else if (value.toLowerCase() === 'true') {
        formulaParts.push(`{${airtableField}} = TRUE()`);
      } else if (value.toLowerCase() === 'false') {
        formulaParts.push(`{${airtableField}} = FALSE()`);
      } else {
        formulaParts.push(`{${airtableField}} = '${escapeAirtableValue(value)}'`);
      }
    }
    
    const filterByFormula = formulaParts.length > 0 ? `AND(${formulaParts.join(', ')})` : '';
    console.log('%c GET /api/citizens request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }

    // Fetch citizens from Airtable
    const citizenRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: filterByFormula,
        sort: [{ field: 'LastActiveAt', direction: 'desc' }]
        // Consider adding limit/offset for pagination if not handled by .all() and subsequent slicing
      })
      .all();

    // Fetch all guilds to create a map from Airtable Record ID to string GuildId
    const guildRecords = await base(AIRTABLE_GUILDS_TABLE)
      .select({ fields: ['GuildId'] }) // Only need GuildId and Airtable Record ID
      .all();
    
    const guildIdMap: Record<string, string> = {}; // Map: AirtableRecordID -> StringGuildID
    guildRecords.forEach(guildRecord => {
      const airtableRecordId = guildRecord.id;
      const stringGuildId = guildRecord.fields.GuildId as string;
      if (airtableRecordId && stringGuildId) {
        guildIdMap[airtableRecordId] = stringGuildId;
      }
    });
    
    // Fetch all buildings to determine employment and housing relationships
    const allBuildings = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        fields: ['Occupant', 'RunBy', 'Type', 'Category', 'BuildingId'] // Added Category and BuildingId
      })
      .all();
    
    // Create maps for employment, workplace, and home
    const employmentMap: Record<string, string> = {};
    const workplaceMap: Record<string, { name: string; type: string; buildingId: string }> = {};
    const homeMap: Record<string, string> = {};
    
    allBuildings.forEach(building => {
      const occupant = building.get('Occupant') as string;
      const runBy = building.get('RunBy') as string;
      const category = building.get('Category') as string;
      const buildingId = building.get('BuildingId') as string;
      const buildingType = building.get('Type') as string || 'Unknown Building';

      if (occupant && buildingId) {
        if (category === 'business') {
          if (runBy) {
            employmentMap[occupant] = runBy;
          }
          workplaceMap[occupant] = {
            name: buildingType,
            type: buildingType,
            buildingId: buildingId 
          };
        } else if (category === 'home') {
          homeMap[occupant] = buildingId;
        }
      }
    });
    
    // Transform Airtable records to our citizen format
    const citizens = citizenRecords.map(record => {
      // Get all fields from Airtable (PascalCase) and convert their keys to camelCase
      const camelCaseFields = toCamelCase(record.fields);

      // Resolve GuildId using the guildIdMap
      // Assumes 'Guild' is the linked record field name in CITIZENS table.
      const linkedGuildAirtableIds = record.fields.Guild as string[] | undefined;
      if (linkedGuildAirtableIds && Array.isArray(linkedGuildAirtableIds) && linkedGuildAirtableIds.length > 0) {
        const guildAirtableRecordId = linkedGuildAirtableIds[0];
        if (guildIdMap[guildAirtableRecordId]) {
          camelCaseFields.guildId = guildIdMap[guildAirtableRecordId];
        } else {
          console.warn(`Citizen ${camelCaseFields.username || record.id} linked to Guild Record ID ${guildAirtableRecordId}, but no string GuildId found in map.`);
          camelCaseFields.guildId = null;
        }
      } else {
        if ('guild' in camelCaseFields) { // If original field was 'Guild'
          delete camelCaseFields.guild;
        }
        camelCaseFields.guildId = null;
      }

      // Ensure 'username' is present from the primary 'Username' Airtable field
      if (record.fields.Username && !camelCaseFields.username) {
        camelCaseFields.username = record.fields.Username as string;
      }
      
      // Parse position if it's a string
      if (typeof camelCaseFields.position === 'string' && 
          (camelCaseFields.position.startsWith('{') || camelCaseFields.position.startsWith('['))) {
        try {
          camelCaseFields.position = JSON.parse(camelCaseFields.position);
        } catch (e) {
          console.warn(`Failed to parse position for citizen ${camelCaseFields.username}: ${camelCaseFields.position}`, e);
        }
      }
      
      // Parse CorePersonality
      let corePersonalityArray: string[] | null = null;
      const corePersonalityString = camelCaseFields.corePersonality as string; // Access camelCased field
      if (typeof corePersonalityString === 'string') { // Check the camelCased field
        try {
          const parsed = JSON.parse(corePersonalityString);
          if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(item => typeof item === 'string')) {
            corePersonalityArray = parsed;
          } else {
            console.warn(`CorePersonality for citizen ${camelCaseFields.username} is not a valid 3-string array: ${corePersonalityString}`);
          }
        } catch (e) {
          console.warn(`Failed to parse CorePersonality for citizen ${camelCaseFields.username}: ${corePersonalityString}`, e);
        }
      }
      
      // Create citizen object, ensuring all keys are camelCase
      const citizenObject = {
        ...camelCaseFields, // Start with all camelCased fields
        corePersonality: corePersonalityArray, // Override with parsed array
        worksFor: employmentMap[camelCaseFields.username as string] || null,
        workplace: workplaceMap[camelCaseFields.username as string] || null,
        home: homeMap[camelCaseFields.username as string] || null
      };
      
      return citizenObject;
    });
    
    return NextResponse.json({
      success: true,
      citizens: citizens
    });
    
  } catch (error) {
    console.error('Error fetching citizens:', error);
    
    // Return a fallback with sample citizens
    // Fallback sample citizens, ensure all keys are camelCase
    const sampleCitizens = [
      {
        username: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImageUrl: null,
        isAi: true,
        socialClass: 'Servant',
        description: 'A helpful Venetian guide',
        position: {"lat": 45.4371, "lng": 12.3326},
        influence: 0,
        wallet: '',
        familyMotto: 'At your service',
        color: '#FFC107',
        guildId: null,
        preferences: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        worksFor: null,
        workplace: null,
        home: null, // Added missing field
        ateAt: null, // Added missing field
        inVenice: true // Added missing field
      },
      {
        username: 'marco_polo',
        firstName: 'Marco',
        lastName: 'Polo',
        coatOfArmsImageUrl: null,
        isAi: true,
        socialClass: 'Merchant',
        description: 'Famous Venetian merchant and explorer',
        position: {"lat": 45.4380, "lng": 12.3350},
        influence: 100,
        wallet: '',
        familyMotto: 'The world awaits',
        color: '#2196F3',
        guildId: 'merchants',
        preferences: {},
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        worksFor: null,
        workplace: null,
        home: null, // Added missing field
        ateAt: null, // Added missing field
        inVenice: true // Added missing field
      },
      {
        username: 'doge_venice',
        firstName: 'Doge',
        lastName: 'of Venice',
        coatOfArmsImageUrl: null,
        isAi: true,
        socialClass: 'Noble',
        description: 'The elected leader of Venice',
        position: {"lat": 45.4337, "lng": 12.3390},
        influence: 1000,
        wallet: '',
        familyMotto: 'For the glory of Venice',
        color: '#9C27B0',
        guildId: 'council',
        preferences: {},
        createdAt: new Date(Date.now() - 31536000000).toISOString(),
        updatedAt: new Date(Date.now() - 604800000).toISOString(),
        worksFor: null,
        workplace: null,
        home: null, // Added missing field
        ateAt: null, // Added missing field
        inVenice: true // Added missing field
      }
    ];
    
    return NextResponse.json({
      success: true,
      citizens: sampleCitizens,
      _fallback: true // Indicate that fallback data is used
    });
  }
}
