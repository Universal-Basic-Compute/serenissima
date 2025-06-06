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
    const { walletAddress, username: requestedUsername } = body; // Expect username now
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Check if citizen already exists by walletAddress
    const existingCitizens = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: `{Wallet} = "${walletAddress}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (existingCitizens && existingCitizens.length > 0) {
      // Citizen already exists, return the existing citizen
      const citizen = existingCitizens[0];
      console.log(`[API Register] Citizen with wallet ${walletAddress} already exists: ${citizen.fields.Username}`);
      return NextResponse.json({
        success: true,
        citizen: {
          id: citizen.id,
          walletAddress: citizen.fields.Wallet,
          username: citizen.fields.Username, // Should exist if record exists
          firstName: citizen.fields.FirstName || null,
          lastName: citizen.fields.LastName || null,
          ducats: citizen.fields.Ducats || 0,
          coatOfArmsImageUrl: citizen.fields.CoatOfArmsImageUrl || null,
          familyMotto: citizen.fields.FamilyMotto || null,
          createdAt: citizen.fields.CreatedAt || null,
          socialClass: citizen.fields.SocialClass || 'Popolani', // Default social class
          color: citizen.fields.Color || '#8B4513', // Default color
        },
        message: 'Citizen already exists'
      });
    }

    // If citizen does not exist, a username MUST be provided for new registration
    if (!requestedUsername) {
      return NextResponse.json(
        { success: false, error: 'Username is required for new registration' },
        { status: 400 }
      );
    }

    // Validate username format (basic validation, more can be added)
    const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (requestedUsername.length < 3 || requestedUsername.length > 20 || !USERNAME_REGEX.test(requestedUsername)) {
      return NextResponse.json(
        { success: false, error: 'Invalid username format or length.' },
        { status: 400 }
      );
    }

    // Check if the requested username is already taken
    const existingUsernames = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: `LOWER({Username}) = LOWER("${requestedUsername.toLowerCase().replace(/'/g, "\\'")}")`,
        maxRecords: 1
      })
      .firstPage();

    if (existingUsernames && existingUsernames.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Username is already taken. Please choose another.' },
        { status: 409 } // Conflict
      );
    }
    
    // Create a new citizen with the provided username
    console.log(`[API Register] Creating new citizen with wallet ${walletAddress} and username ${requestedUsername}`);
    const newCitizenRecord = await base(CITIZENS_TABLE).create([
      {
        fields: {
          Wallet: walletAddress,
          Username: requestedUsername,
          CitizenId: requestedUsername, // Set CitizenId to be the same as Username
          FirstName: '', // Initialize as empty, user can edit later
          LastName: '',  // Initialize as empty
          Ducats: 100, // Starting amount
          SocialClass: 'Popolani', // Default social class for new citizens
          Color: '#8B4513', // Default color
          InVenice: true, // Assume new citizens start in Venice
          IsAI: false, // Human player
          CreatedAt: new Date().toISOString(),
          LastActiveAt: new Date().toISOString(),
        }
      }
    ]);

    if (!newCitizenRecord || newCitizenRecord.length === 0) {
        throw new Error("Failed to create new citizen record in Airtable.");
    }
    const newCitizen = newCitizenRecord[0];
    
    return NextResponse.json({
      success: true,
      citizen: {
        id: newCitizen.id,
        walletAddress: newCitizen.fields.Wallet,
        username: newCitizen.fields.Username,
        firstName: newCitizen.fields.FirstName || null,
        lastName: newCitizen.fields.LastName || null,
        ducats: newCitizen.fields.Ducats || 100,
        coatOfArmsImageUrl: newCitizen.fields.CoatOfArmsImageUrl || null,
        familyMotto: newCitizen.fields.FamilyMotto || null,
        createdAt: newCitizen.fields.CreatedAt,
        socialClass: newCitizen.fields.SocialClass,
        color: newCitizen.fields.Color,
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
