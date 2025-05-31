import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;

// Helper to escape single quotes for Airtable formulas
function escapeAirtableValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "\\'");
}

export async function GET(request: Request) {
  try {
    // Check if Airtable credentials are configured
    if (!airtableApiKey || !airtableBaseId) {
      throw new Error('Airtable credentials not configured');
    }

    // Initialize Airtable
    const base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
    const url = new URL(request.url);

    const formulaParts: string[] = [];
    const loggableFilters: Record<string, string> = {};
    const reservedParams = ['limit', 'offset', 'sortField', 'sortDirection'];

    for (const [key, value] of url.searchParams.entries()) {
      if (reservedParams.includes(key.toLowerCase())) {
        continue;
      }
      const airtableField = key;
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
    console.log('%c GET /api/decrees request received', 'background: #FFFF00; color: black; padding: 2px 5px; font-weight: bold;');
    console.log('Query parameters (filters):', loggableFilters);
    if (filterByFormula) {
      console.log('Applying Airtable filter formula:', filterByFormula);
    }
    
    // Fetch decrees from the DECREES table
    const records = await base('DECREES').select({
      filterByFormula: filterByFormula,
      sort: [{ field: 'CreatedAt', direction: 'desc' }]
    }).all();
    
    // Map Airtable records to the expected format
    const decrees = records.map(record => {
      const fields = record.fields;
      
      return {
        DecreeId: fields.DecreeId || record.id,
        Type: fields.Type || '',
        Title: fields.Title || '',
        Description: fields.Description || '',
        Status: fields.Status || 'Proposed',
        Category: fields.Category || '',
        SubCategory: fields.SubCategory || '',
        Proposer: fields.Proposer || '',
        CreatedAt: fields.CreatedAt || '',
        EnactedAt: fields.EnactedAt || null,
        ExpiresAt: fields.ExpiresAt || null,
        FlavorText: fields.FlavorText || '',
        HistoricalInspiration: fields.HistoricalInspiration || '',
        Notes: fields.Notes || '',
        Rationale: fields.Rationale || ''
      };
    });
    
    // Return the decrees as JSON
    return NextResponse.json(decrees);
  } catch (error) {
    console.error('Error fetching decrees:', error);
    
    // Return an appropriate error response
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
