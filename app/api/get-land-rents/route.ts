import { NextResponse } from 'next/server';
import { airtableUtils } from '@/lib/utils/airtableUtils';
import { LandRent } from '@/lib/utils/airtableUtils';

export async function GET(request: Request) {
  try {
    // Get land rents from Airtable
    const landRents = await airtableUtils.getLandRents();
    
    // Set cache headers to allow browsers to cache the response
    const headers = new Headers();
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    return new NextResponse(JSON.stringify({ 
      success: true, 
      landRents,
      metadata: {
        totalLands: landRents.length,
        averageRent: landRents.length > 0 
          ? Math.round(landRents.reduce((sum: number, land: LandRent) => sum + land.dailyRent, 0) / landRents.length)
          : 0,
        minRent: landRents.length > 0 ? Math.min(...landRents.map((land: LandRent) => land.dailyRent)) : 0,
        maxRent: landRents.length > 0 ? Math.max(...landRents.map((land: LandRent) => land.dailyRent)) : 0
      }
    }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error fetching land rents from Airtable:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch land rents' },
      { status: 500 }
    );
  }
}
