import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { NextRequest } from 'next/server';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const CITIZENS_TABLE = 'CITIZENS';

// Helper function to extract wallet address from the request
function extractWalletAddressFromRequest(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/citizens\/wallet\/([^/]+)/);
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
    
    // Find citizen by wallet address
    const citizens = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: `{Wallet} = "${walletAddress}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (!citizens || citizens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Citizen not found' },
        { status: 404 }
      );
    }
    
    const citizen = citizens[0];
    
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
      }
    });
  } catch (error) {
    console.error('Error fetching citizen by wallet address:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch citizen' },
      { status: 500 }
    );
  }
}
