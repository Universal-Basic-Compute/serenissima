import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const buildingsTable = base('Buildings');

export async function GET() {
  try {
    // Query Airtable for roads
    const records = await buildingsTable.select({
      filterByFormula: "{Type} = 'road'",
      sort: [{ field: 'CreatedAt', direction: 'desc' }]
    }).all();
    
    // Transform records to our format
    const roads = records.map(record => {
      // Parse the Position field which contains the road points
      let points = record.get('Position');
      if (typeof points === 'string') {
        try {
          points = JSON.parse(points);
        } catch (e) {
          console.error('Error parsing road points:', e);
          points = [];
        }
      }
      
      return {
        id: record.id,
        name: record.get('Name') as string,
        land_id: record.get('Land') as string,
        owner: record.get('Owner') as string,
        points: points,
        curvature: record.get('Curvature') as number,
        created_at: record.get('CreatedAt') as string,
        status: record.get('Status') as string
      };
    });
    
    return NextResponse.json({
      success: true,
      roads
    });
  } catch (error) {
    console.error('Error fetching roads from Airtable:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch roads' },
      { status: 500 }
    );
  }
}
