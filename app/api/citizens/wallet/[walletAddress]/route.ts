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
    console.log(`[API Wallet ${walletAddress}] Found citizen record: ${citizenRecord.id}`, citizenFields);

    let resolvedGuildId: string | null = null;
    const linkedGuildAirtableIds = citizenFields.Guild as string[] | undefined;
    console.log(`[API Wallet ${walletAddress}] Linked Guild Airtable IDs from citizen record:`, linkedGuildAirtableIds);

    if (linkedGuildAirtableIds && Array.isArray(linkedGuildAirtableIds) && linkedGuildAirtableIds.length > 0) {
      const guildAirtableRecordId = linkedGuildAirtableIds[0];
      console.log(`[API Wallet ${walletAddress}] Attempting to fetch Guild record with Airtable ID: ${guildAirtableRecordId}`);
      try {
        const guildRecord = await base(AIRTABLE_GUILDS_TABLE).find(guildAirtableRecordId);
        if (guildRecord) {
          console.log(`[API Wallet ${walletAddress}] Found Guild record:`, guildRecord.fields);
          if (guildRecord.fields.GuildId) {
            resolvedGuildId = guildRecord.fields.GuildId as string;
            console.log(`[API Wallet ${walletAddress}] Resolved GuildId: ${resolvedGuildId}`);
          } else {
            console.warn(`[API Wallet ${walletAddress}] Guild record ${guildAirtableRecordId} found, but no 'GuildId' (string identifier) field.`);
            resolvedGuildId = null; // Explicitly null if field missing
          }
        } else {
          console.warn(`[API Wallet ${walletAddress}] Guild record with Airtable ID ${guildAirtableRecordId} not found.`);
          resolvedGuildId = null; // Explicitly null if record not found
        }
      } catch (guildError) {
        console.error(`[API Wallet ${walletAddress}] Error fetching guild details for guild record ID ${guildAirtableRecordId}:`, guildError);
        resolvedGuildId = null; // Explicitly null on error
      }
    } else {
      console.log(`[API Wallet ${walletAddress}] No linked Guild Airtable IDs found for this citizen.`);
      resolvedGuildId = null; // Explicitly null if no link
    }
    
    const responsePayload = {
      success: true,
      citizen: {
        id: citizenRecord.id,
        username: citizenFields.Username || null,
        firstName: citizenFields.FirstName || null,
        lastName: citizenFields.LastName || null,
        ducats: citizenFields.Ducats || 0,
        coatOfArmsImageUrl: citizenFields.CoatOfArmsImageUrl || null,
        familyMotto: citizenFields.FamilyMotto || null,
        createdAt: citizenFields.CreatedAt || null,
        guildId: resolvedGuildId,
        color: citizenFields.Color || null,
        socialClass: citizenFields.SocialClass || null // Ensure socialClass is also passed
      }
    };
    console.log(`[API Wallet ${walletAddress}] Returning response payload:`, responsePayload);
    
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Error fetching citizen by wallet address:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch citizen' },
      { status: 500 }
    );
  }
}
