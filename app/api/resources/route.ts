import { NextResponse } from 'next/server';
import { loadAllResources } from '@/lib/serverResourceUtils';
import Airtable from 'airtable';

// Configure Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

// Initialize Airtable base
const base = new Airtable({ apiKey }).base(baseId);

export async function GET() {
  try {
    const resources = await loadAllResources();
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error loading resources:', error);
    return NextResponse.json(
      { error: 'Failed to load resources' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id) {
      return NextResponse.json(
        { success: false, error: 'Resource ID is required' },
        { status: 400 }
      );
    }
    
    if (!data.type) {
      return NextResponse.json(
        { success: false, error: 'Resource type is required' },
        { status: 400 }
      );
    }
    
    if (!data.position) {
      return NextResponse.json(
        { success: false, error: 'Position is required' },
        { status: 400 }
      );
    }
    
    // Ensure position is properly formatted
    let position = data.position;
    
    // If position is a string, try to parse it
    if (typeof position === 'string') {
      try {
        position = JSON.parse(position);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: 'Invalid position format - could not parse JSON string' },
          { status: 400 }
        );
      }
    }
    
    // Validate that position has required properties
    if (typeof position !== 'object' || 
        (position.lat === undefined && position.x === undefined) || 
        (position.lng === undefined && position.z === undefined)) {
      return NextResponse.json(
        { success: false, error: 'Position must have either lat/lng or x/y/z coordinates' },
        { status: 400 }
      );
    }
    
    // Log the received data for debugging
    console.log('Creating resource with data:', JSON.stringify({
      ...data,
      position: position
    }, null, 2));
    
    // Create a record in Airtable - ensure position is stored as a string
    const record = await new Promise((resolve, reject) => {
      base('RESOURCES').create({
        ResourceId: data.id,
        Type: data.type,
        Name: data.name || data.type,
        Category: data.category || 'unknown',
        Position: JSON.stringify(position),
        Count: data.count || 1,
        LandId: data.landId || '',
        Owner: data.owner || 'system',
        CreatedAt: data.createdAt || new Date().toISOString()
      }, function(err, record) {
        if (err) {
          console.error('Error creating resource in Airtable:', err);
          reject(err);
          return;
        }
        resolve(record);
      });
    });
    
    // Define the Airtable record type
    interface AirtableRecord {
      id: string;
      fields: {
        ResourceId: string;
        Type: string;
        Name: string;
        Category: string;
        Position: string;
        Count: number;
        LandId: string;
        Owner: string;
        CreatedAt: string;
      };
    }

    // Transform the Airtable record to our format
    const typedRecord = record as AirtableRecord;
    const resource = {
      id: typedRecord.fields.ResourceId,
      type: typedRecord.fields.Type,
      name: typedRecord.fields.Name,
      category: typedRecord.fields.Category,
      position: JSON.parse(typedRecord.fields.Position),
      count: typedRecord.fields.Count,
      landId: typedRecord.fields.LandId,
      owner: typedRecord.fields.Owner,
      createdAt: typedRecord.fields.CreatedAt
    };
    
    console.log('Successfully created resource in Airtable:', resource);
    
    // Return the created resource with success flag
    return NextResponse.json({ 
      success: true, 
      resource,
      message: 'Resource created successfully'
    });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create resource', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
