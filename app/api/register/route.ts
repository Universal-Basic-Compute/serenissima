import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const USERS_TABLE = 'USERS';

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
    
    // Check if user already exists
    const existingUsers = await base(USERS_TABLE)
      .select({
        filterByFormula: `{Wallet} = "${walletAddress}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (existingUsers && existingUsers.length > 0) {
      // User already exists, return the existing user
      const user = existingUsers[0];
      
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          walletAddress: user.fields.Wallet,
          username: user.fields.Username || null,
          firstName: user.fields.FirstName || null,
          lastName: user.fields.LastName || null,
          ducats: user.fields.Ducats || 0,
          coatOfArmsImage: user.fields.CoatOfArmsImage || null,
          familyMotto: user.fields.FamilyMotto || null,
          createdAt: user.fields.CreatedAt || null
        },
        message: 'User already exists'
      });
    }
    
    // Create a new user
    const newUser = await base(USERS_TABLE).create({
      Wallet: walletAddress,
      Ducats: 100, // Starting amount
      CreatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        walletAddress: newUser.fields.Wallet,
        username: null,
        firstName: null,
        lastName: null,
        ducats: newUser.fields.Ducats || 100,
        coatOfArmsImage: null,
        familyMotto: null,
        createdAt: newUser.fields.CreatedAt
      },
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
