import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Define Airtable related types locally
interface FieldSet {
  [key: string]: any; // Airtable field value can be string, number, boolean, array, etc.
}

interface AirtableRecord<TFields extends FieldSet> {
  id: string;
  fields: TFields;
  createdTime: string;
}

// Airtable Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const CITIZENS_TABLE_NAME = process.env.CITIZENS_TABLE_NAME || 'CITIZENS';
const TRANSACTIONS_TABLE_NAME = process.env.TRANSACTIONS_TABLE_NAME || 'TRANSACTIONS';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error('Airtable API Key or Base ID is not configured in environment variables.');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Define the expected request body structure
interface InjectComputeRequestBody {
  wallet_address: string;
  ducats: number;
  transaction_signature: string;
}

// Define the structure for the citizen data we expect to update and return
// This should align with what WalletProvider expects for citizenProfile
interface CitizenProfile {
  id: string; // Airtable record ID
  username?: string;
  FirstName?: string;
  LastName?: string;
  SocialClass?: string;
  Ducats?: number;
  Wallet?: string;
  CoatOfArmsImageUrl?: string;
  FamilyMotto?: string;
  // Add other fields that are part of the citizen profile
  [key: string]: any; // Allow other fields
}

export async function POST(request: NextRequest) {
  console.log('Received request for /api/inject-compute-complete');
  try {
    const body: InjectComputeRequestBody = await request.json();
    const { wallet_address, ducats, transaction_signature } = body;

    console.log('Request body:', body);

    if (!wallet_address || typeof ducats !== 'number' || ducats <= 0 || !transaction_signature) {
      console.error('Validation Error: Missing or invalid parameters');
      return NextResponse.json({ detail: 'Missing or invalid parameters: wallet_address, ducats (positive number), and transaction_signature are required.' }, { status: 400 });
    }

    // Find citizen by wallet address
    const citizenRecords = await base(CITIZENS_TABLE_NAME)
      .select({
        filterByFormula: `{Wallet} = '${wallet_address}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (!citizenRecords || citizenRecords.length === 0) {
      console.error(`Citizen not found for wallet: ${wallet_address}`);
      return NextResponse.json({ detail: 'Citizen not found for the provided wallet address.' }, { status: 404 });
    }
    const airtableCitizen = citizenRecords[0] as unknown as AirtableRecord<FieldSet>;
    console.log(`Citizen found: ${airtableCitizen.id}, current Ducats: ${airtableCitizen.fields.Ducats}`);

    // Update citizen's Ducats balance
    const currentDucats = Number(airtableCitizen.fields.Ducats) || 0;
    const newDucats = currentDucats + ducats;
    const updatedCitizenFields = { Ducats: newDucats };

    const updatedCitizenRecords = await base(CITIZENS_TABLE_NAME).update([
      {
        id: airtableCitizen.id,
        fields: updatedCitizenFields,
      },
    ]);

    if (!updatedCitizenRecords || updatedCitizenRecords.length === 0) {
      console.error(`Failed to update citizen ${airtableCitizen.id} Ducats.`);
      return NextResponse.json({ detail: 'Failed to update citizen balance after successful on-chain transaction. Please contact support.' }, { status: 500 });
    }
    const updatedAirtableCitizen = updatedCitizenRecords[0] as unknown as AirtableRecord<FieldSet>;
    console.log(`Citizen ${updatedAirtableCitizen.id} Ducats updated to: ${updatedAirtableCitizen.fields.Ducats}`);

    // Create a transaction record for the citizen
    const citizenTransactionData = {
      Type: 'compute_injection',
      AssetType: 'COMPUTE Token',
      Asset: transaction_signature,
      Seller: 'RepublicTreasury',
      Buyer: updatedAirtableCitizen.fields.Username as string || updatedAirtableCitizen.fields.CitizenId as string || wallet_address,
      Price: ducats,
      Notes: `Citizen injected ${ducats} $COMPUTE, new balance: ${newDucats}. Signature: ${transaction_signature}`,
      ExecutedAt: new Date().toISOString(),
    };

    // Ensure only intended fields are sent to Airtable for the transaction record.
    // This prevents any unintended fields (like computed system fields) from being included.
    const finalTransactionData: FieldSet = {
      Type: citizenTransactionData.Type,
      AssetType: citizenTransactionData.AssetType,
      Asset: citizenTransactionData.Asset,
      Seller: citizenTransactionData.Seller,
      Buyer: citizenTransactionData.Buyer,
      Price: citizenTransactionData.Price,
      Notes: citizenTransactionData.Notes,
      // The field 'ExecutedAt' from the schema is not being populated here.
      // Instead, the execution timestamp is sent to 'CreatedAt'.
      CreatedAt: citizenTransactionData.ExecutedAt, // Using the value originally prepared for ExecutedAt
      // Computed fields like UpdatedAt should not be included.
    };

    let citizenTransactionId: string | null = null;
    try {
      const createdTransactionRecords = await base(TRANSACTIONS_TABLE_NAME).create([
        { fields: finalTransactionData },
      ]);
      if (createdTransactionRecords && createdTransactionRecords.length > 0) {
        citizenTransactionId = createdTransactionRecords[0].id;
        console.log(`Transaction record created for citizen: ${citizenTransactionId}`);
      } else {
        console.warn(`Failed to create transaction record for citizen ${updatedAirtableCitizen.id}. Airtable's response might be empty or not as expected.`);
      }
    } catch (txError: any) { // Catch as 'any' to access properties like 'message' or 'stack'
        console.error(`CRITICAL: Error creating transaction record for citizen ${updatedAirtableCitizen.id}. Details:`, txError);
        if (txError.message) {
            console.error("Airtable error message:", txError.message);
        }
        if (txError.stack) {
            console.error("Airtable error stack:", txError.stack);
        }
        // Log the data we attempted to send
        console.error("Attempted transaction data:", JSON.stringify(citizenTransactionData, null, 2));
        // Optionally, you could add a field to the response to indicate this partial failure
        // For now, keeping the 200 response as primary operation (Ducats update) succeeded.
    }
    
    // Prepare the citizen profile to return
    const citizenProfileToReturn: CitizenProfile = {
      id: updatedAirtableCitizen.id,
      ...updatedAirtableCitizen.fields,
      username: updatedAirtableCitizen.fields.Username as string || undefined,
      FirstName: updatedAirtableCitizen.fields.FirstName as string || undefined,
      LastName: updatedAirtableCitizen.fields.LastName as string || undefined,
      SocialClass: updatedAirtableCitizen.fields.SocialClass as string || undefined,
      Ducats: updatedAirtableCitizen.fields.Ducats as number || 0,
      Wallet: updatedAirtableCitizen.fields.Wallet as string || undefined,
      CoatOfArmsImageUrl: updatedAirtableCitizen.fields.CoatOfArmsImageUrl as string || undefined,
      FamilyMotto: updatedAirtableCitizen.fields.FamilyMotto as string || undefined,
    };
    
    console.log('Returning updated citizen profile:', citizenProfileToReturn);

    return NextResponse.json({
      message: 'Compute injected and citizen profile updated successfully.',
      citizen: citizenProfileToReturn,
      transactionId: citizenTransactionId
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/inject-compute-complete:', error);
    // Ensure error is an instance of Error for consistent message property
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ detail: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
