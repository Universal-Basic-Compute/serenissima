import { NextRequest, NextResponse } from 'next/server';
import Airtable, { FieldSet, Records, Table } from 'airtable';
import dotenv from 'dotenv';

dotenv.config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CONTRACTS_TABLE_NAME = process.env.AIRTABLE_CONTRACTS_TABLE || "CONTRACTS";

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("CRITICAL: Missing Airtable API Key or Base ID for /api/transactions/land-offers/[landId] route.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);
const contractsTable: Table<FieldSet> = base(AIRTABLE_CONTRACTS_TABLE_NAME!);

interface ContractFields extends FieldSet {
  ResourceType?: string;
  Type?: string;
  Status?: string;
  Seller?: string;
  Buyer?: string;
  PricePerResource?: number;
  Notes?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  ExecutedAt?: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ landId: string }> }
) {
  const { landId } = await context.params;

  if (!landId) {
    return NextResponse.json({ error: 'Land ID is required' }, { status: 400 });
  }

  console.log(`[API Land Offers] Request for landId: ${landId}`);

  try {
    const uniqueIds = new Set<string>();
    uniqueIds.add(landId);
    if (landId.startsWith("polygon-")) {
      uniqueIds.add(landId.replace("polygon-", ""));
    } else {
      uniqueIds.add(`polygon-${landId}`);
    }
    const possible_ids = Array.from(uniqueIds);
    console.log(`[API Land Offers] Possible ResourceType IDs: ${possible_ids.join(', ')}`);

    const id_conditions_parts = possible_ids.map(pid => `{ResourceType}='${pid}'`);
    const id_conditions = `OR(${id_conditions_parts.join(',')})`;
    
    // Fetch 'available' or 'pending_execution' land sale contracts (offers)
    // This logic mirrors the Python backend's /api/transactions/land/{land_id}
    const filterFormula = `AND(${id_conditions}, {Type}='land_sale', OR({Status}='available', {Status}='pending_execution'))`;
    
    console.log(`[API Land Offers] Searching contracts with formula: ${filterFormula}`);
    const records: Records<ContractFields> = await contractsTable.select({
      filterByFormula: filterFormula,
      sort: [{ field: "CreatedAt", direction: "desc" }]
    }).all();

    if (!records || records.length === 0) {
      console.log(`[API Land Offers] No contracts found for land ${landId}.`);
      return NextResponse.json([]); // Return empty array if no offers
    }

    const offersResponse = records.map(record => {
      const fields = record.fields;
      let notesData: any = {};
      if (fields.Notes && typeof fields.Notes === 'string') {
        try {
          notesData = JSON.parse(fields.Notes as string);
        } catch (e) {
          console.warn(`[API Land Offers] Failed to parse Notes for ${record.id}: ${fields.Notes}. Error: ${e}`);
        }
      }
      return {
        id: record.id,
        type: fields.Type || "land_sale",
        asset: fields.ResourceType,
        seller: fields.Seller,
        buyer: fields.Buyer,
        price: fields.PricePerResource,
        historical_name: notesData.historical_name,
        english_name: notesData.english_name,
        description: notesData.description,
        created_at: fields.CreatedAt,
        updated_at: fields.UpdatedAt,
        executed_at: fields.ExecutedAt,
        status: fields.Status
      };
    });
    
    console.log(`[API Land Offers] Found ${offersResponse.length} offers for land ${landId}.`);
    return NextResponse.json(offersResponse);

  } catch (error) {
    console.error(`[API Land Offers] Error for ${landId}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to fetch offers from Airtable', details: errorMessage }, { status: 500 });
  }
}
