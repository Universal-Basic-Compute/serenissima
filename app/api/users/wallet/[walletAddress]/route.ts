import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { NextRequest } from 'next/server';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const USERS_TABLE = 'USERS';

// Helper function to extract wallet address from the request
function extractWalletAddressFromRequest(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/users\/wallet\/([^/]+)/);
  return match?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const walletAddress = extractWalletAddressFromRequest(request);
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Find user by wallet address
    const users = await base(USERS_TABLE)
      .select({
        filterByFormula: `{Wallet} = "${walletAddress}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    
    const user = users[0];
    
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
      }
    });
  } catch (error) {
    console.error('Error fetching user by wallet address:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
