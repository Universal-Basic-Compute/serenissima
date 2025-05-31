import { NextResponse } from 'next/server';
import Airtable from 'airtable';
import { NextRequest } from 'next/server';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_GUILDS_TABLE = process.env.AIRTABLE_GUILDS_TABLE || 'GUILDS'; // Ajout de la table GUILDS

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
    
    const citizenRecord = citizens[0];
    const citizenFields = citizenRecord.fields;

    let resolvedGuildId: string | null = null;
    const linkedGuildAirtableIds = citizenFields.Guild as string[] | undefined;

    if (linkedGuildAirtableIds && Array.isArray(linkedGuildAirtableIds) && linkedGuildAirtableIds.length > 0) {
      const guildAirtableRecordId = linkedGuildAirtableIds[0];
      try {
        const guildRecord = await base(AIRTABLE_GUILDS_TABLE).find(guildAirtableRecordId);
        if (guildRecord && guildRecord.fields.GuildId) {
          resolvedGuildId = guildRecord.fields.GuildId as string;
        } else {
          console.warn(`Citizen via wallet ${walletAddress}: Guild record ${guildAirtableRecordId} found, but no GuildId field.`);
        }
      } catch (guildError) {
        console.error(`Citizen via wallet ${walletAddress}: Error fetching guild details for guild record ID ${guildAirtableRecordId}:`, guildError);
      }
    }
    
    return NextResponse.json({
      success: true,
      citizen: {
        id: citizenRecord.id,
        // walletAddress: citizenFields.Wallet, // Not strictly needed in response as it was the query param
        username: citizenFields.Username || null,
        firstName: citizenFields.FirstName || null,
        lastName: citizenFields.LastName || null,
        ducats: citizenFields.Ducats || 0,
        coatOfArmsImageUrl: citizenFields.CoatOfArmsImageUrl || null,
        familyMotto: citizenFields.FamilyMotto || null,
        createdAt: citizenFields.CreatedAt || null,
        guildId: resolvedGuildId, // Ajout du guildId résolu
        color: citizenFields.Color || null // Ajout de la couleur
        // Ajoutez d'autres champs nécessaires pour CitizenProfile ici, ex: socialClass
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
