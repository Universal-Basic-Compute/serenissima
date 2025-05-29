import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const CITIZENS_TABLE = 'CITIZENS';

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body = await request.json();
    const { walletAddress } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Check if citizen already exists
    const existingCitizens = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: `{Wallet} = "${walletAddress}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (existingCitizens && existingCitizens.length > 0) {
      // Citizen already exists, return the existing citizen
      const citizen = existingCitizens[0];
      
      return NextResponse.json({
        success: true,
        citizen: {
          id: citizen.id,
          walletAddress: citizen.fields.Wallet,
          username: citizen.fields.Username || null,
          firstName: citizen.fields.FirstName || null,
          lastName: citizen.fields.LastName || null,
          ducats: citizen.fields.Ducats || 0,
          coatOfArmsImageUrl: citizen.fields.CoatOfArmsImageUrl || null,
          familyMotto: citizen.fields.FamilyMotto || null,
          createdAt: citizen.fields.CreatedAt || null
        },
        message: 'Citizen already exists'
      });
    }
    
    // Create a new citizen
    const newCitizen = await base(CITIZENS_TABLE).create({
      Wallet: walletAddress,
      Ducats: 100, // Starting amount
      CreatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      citizen: {
        id: newCitizen.id,
        walletAddress: newCitizen.fields.Wallet,
        username: null,
        firstName: null,
        lastName: null,
        ducats: newCitizen.fields.Ducats || 100,
        coatOfArmsImageUrl: null,
        familyMotto: null,
        createdAt: newCitizen.fields.CreatedAt
      },
      message: 'Citizen registered successfully'
    });
  } catch (error) {
    console.error('Error registering citizen:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register citizen' },
      { status: 500 }
    );
  }
}
