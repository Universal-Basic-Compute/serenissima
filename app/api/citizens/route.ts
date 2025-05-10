import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const CITIZENS_TABLE = 'CITIZENS';

export async function GET(request: Request) {
  try {
    console.log('Fetching citizens from Airtable...');
    
    // Get query parameters
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50;
    const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0;
    
    // Fetch records from Airtable
    const records = await base(CITIZENS_TABLE)
      .select({
        maxRecords: limit,
        offset: offset,
        view: 'Grid view',
        sort: [{ field: 'CreatedAt', direction: 'desc' }]
      })
      .firstPage();
    
    // Transform Airtable records to our Citizen interface format
    const citizens = records.map(record => {
      const fields = record.fields;
      return {
        CitizenId: fields.CitizenId || record.id,
        SocialClass: fields.SocialClass || '',
        FirstName: fields.FirstName || '',
        LastName: fields.LastName || '',
        Description: fields.Description || '',
        ImageUrl: fields.ImageUrl || null,
        Wealth: fields.Wealth || '',
        Home: fields.Home || '',
        Work: fields.Work || '',
        NeedsCompletionScore: typeof fields.NeedsCompletionScore === 'number' ? fields.NeedsCompletionScore : 0,
        CreatedAt: fields.CreatedAt || new Date().toISOString()
      };
    });
    
    console.log(`Retrieved ${citizens.length} citizens from Airtable`);
    return NextResponse.json(citizens);
  } catch (error) {
    console.error('Error fetching citizens from Airtable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch citizens data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
