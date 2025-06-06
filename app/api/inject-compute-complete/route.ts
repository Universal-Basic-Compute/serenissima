import { NextRequest, NextResponse } from 'next/server';
import { getAirtableBase, findCitizenByWallet, updateCitizen, addTransaction } from '@/lib/airtable';
import { AirtableRecord } from '@/lib/airtable'; // Assuming AirtableRecord type is defined here or elsewhere

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

    const base = getAirtableBase();
    const airtableCitizen = await findCitizenByWallet(base, wallet_address);

    if (!airtableCitizen) {
      console.error(`Citizen not found for wallet: ${wallet_address}`);
      return NextResponse.json({ detail: 'Citizen not found for the provided wallet address.' }, { status: 404 });
    }

    console.log(`Citizen found: ${airtableCitizen.id}, current Ducats: ${airtableCitizen.fields.Ducats}`);

    const currentDucats = Number(airtableCitizen.fields.Ducats) || 0;
    const newDucats = currentDucats + ducats;

    // Update citizen's Ducats balance
    const updatedFields = {
      Ducats: newDucats,
    };

    // The updateCitizen function needs to handle the AirtableRecord structure
    // It should take the record ID and the fields to update.
    // Let's assume updateCitizen returns the updated AirtableRecord<FieldSet>
    const updatedAirtableCitizen = await updateCitizen(base, airtableCitizen.id, updatedFields);

    if (!updatedAirtableCitizen) {
      console.error(`Failed to update citizen ${airtableCitizen.id} Ducats.`);
      // Potentially, the on-chain transaction succeeded but DB update failed. This is a critical state.
      // Consider logging this for manual reconciliation.
      return NextResponse.json({ detail: 'Failed to update citizen balance after successful on-chain transaction. Please contact support.' }, { status: 500 });
    }
    
    console.log(`Citizen ${updatedAirtableCitizen.id} Ducats updated to: ${updatedAirtableCitizen.fields.Ducats}`);


    // Create a transaction record
    const transactionData = {
      Type: 'compute_injection', // Or 'COMPUTE Injection'
      AssetType: 'COMPUTE Token',
      Asset: transaction_signature, // Store the on-chain transaction signature
      Seller: 'RepublicTreasury', // Or a system identifier
      Buyer: updatedAirtableCitizen.fields.Username as string || updatedAirtableCitizen.fields.CitizenId as string || wallet_address, // Citizen's username or ID
      Price: ducats, // The amount of Ducats added, which corresponds to the COMPUTE injected
      Notes: `Citizen injected ${ducats} $COMPUTE, new balance: ${newDucats}. Signature: ${transaction_signature}`,
      ExecutedAt: new Date().toISOString(),
      // CreatedAt will be set by Airtable
    };

    const transactionRecord = await addTransaction(base, transactionData);
    if (!transactionRecord) {
        console.warn(`Failed to create transaction record for citizen ${updatedAirtableCitizen.id}. Continuing with success response as Ducats were updated.`);
        // Not returning an error here as the primary operation (Ducats update) succeeded.
        // This should be logged for monitoring.
    } else {
        console.log(`Transaction record created: ${transactionRecord.id}`);
    }

    // Prepare the citizen profile to return, ensuring it matches the expected structure
    // The `fields` property of an AirtableRecord contains the actual data.
    const citizenProfileToReturn: CitizenProfile = {
      id: updatedAirtableCitizen.id, // Airtable Record ID
      ...updatedAirtableCitizen.fields, // Spread all fields from Airtable
      // Ensure key fields expected by the frontend are present, even if null/undefined
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
      citizen: citizenProfileToReturn, // Return the updated citizen profile
      transactionId: transactionRecord ? transactionRecord.id : null
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/inject-compute-complete:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ detail: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
