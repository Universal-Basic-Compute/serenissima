import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_REPORTS_TABLE = 'REPORTS';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
};

// Helper to escape single quotes for Airtable formulas
const escapeAirtableValue = (value: string): string => {
  return value.replace(/'/g, "\\'");
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    // Initialize Airtable
    const base = initAirtable();
    
    // Get current date in ISO format
    const now = new Date().toISOString();
    
    // Build filter formula to get active reports (EndAt > now)
    let filterFormula = `{EndAt} > '${escapeAirtableValue(now)}'`;
    
    // Add category filter if provided
    if (category) {
      filterFormula = `AND(${filterFormula}, {Category} = '${escapeAirtableValue(category)}')`;
    }
    
    // Fetch reports from Airtable
    const records = await base(AIRTABLE_REPORTS_TABLE)
      .select({
        filterByFormula: filterFormula,
        sort: [{ field: 'CreatedAt', direction: 'desc' }]
      })
      .all();
    
    // Transform Airtable records to our report format
    const reports = records.map(record => ({
      reportId: record.get('ReportId') as string,
      category: record.get('Category') as string,
      originCity: record.get('OriginCity') as string,
      title: record.get('Title') as string,
      content: record.get('Content') as string,
      historicalNotes: record.get('HistoricalNotes') as string,
      affectedResources: JSON.parse(record.get('AffectedResources') as string || '[]'),
      priceChanges: JSON.parse(record.get('PriceChanges') as string || '[]'),
      availabilityChanges: JSON.parse(record.get('AvailabilityChanges') as string || '[]'),
      createdAt: record.get('CreatedAt') as string,
      endAt: record.get('EndAt') as string
    }));
    
    return NextResponse.json({
      success: true,
      reports: reports
    });
    
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}
