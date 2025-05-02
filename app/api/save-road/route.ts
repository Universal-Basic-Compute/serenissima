import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const buildingsTable = base('Buildings');

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id || !data.type || data.type !== 'road' || !data.points) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get current user's wallet address if not provided
    let userId = data.user_id;
    if (!userId) {
      // This would need to be handled differently in a real app
      // Here we're assuming the API is called with the user's wallet address
      userId = 'ConsiglioDeiDieci'; // Default to Council of Ten if no user specified
    }
    
    // Create record in Airtable
    const record = await buildingsTable.create({
      Type: 'road',
      Name: `Road ${data.id.split('-').pop()}`, // Generate a name based on the ID
      Land: data.land_id || '',
      Owner: userId,
      Position: data.points, // Store the road points as a string
      Curvature: data.curvature || 0.5,
      CreatedAt: data.created_at || new Date().toISOString(),
      Status: 'active'
    });
    
    return NextResponse.json({
      success: true,
      id: record.id,
      message: 'Road saved successfully'
    });
  } catch (error) {
    console.error('Error saving road to Airtable:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save road' },
      { status: 500 }
    );
  }
}
