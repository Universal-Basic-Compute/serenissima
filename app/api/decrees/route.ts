import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;

export async function GET() {
  try {
    // Check if Airtable credentials are configured
    if (!airtableApiKey || !airtableBaseId) {
      throw new Error('Airtable credentials not configured');
    }

    // Initialize Airtable
    const base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
    
    // Fetch decrees from the DECREES table
    const records = await base('DECREES').select({
      // Sort by CreatedAt in descending order
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
