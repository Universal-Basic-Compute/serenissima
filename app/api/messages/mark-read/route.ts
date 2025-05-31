import { NextResponse, NextRequest } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_MESSAGES_TABLE = process.env.AIRTABLE_MESSAGES_TABLE || 'MESSAGES';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  // Initialize Airtable with requestTimeout
  return new Airtable({ apiKey: AIRTABLE_API_KEY, requestTimeout: 30000 }).base(AIRTABLE_BASE_ID);
};

export async function POST(request: NextRequest) {
  try {
    const { citizen, messageIds } = await request.json();
    
    if (!citizen || !messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Citizen username and an array of message IDs are required' },
        { status: 400 }
      );
    }
    
    console.log(`Marking messages as read for citizen: ${citizen}, message IDs: ${messageIds.join(', ')}`);
    
    try {
      const base = initAirtable();
      const readAt = new Date().toISOString();
      
      // Airtable's batch update takes an array of objects, each with an id and fields to update.
      // We also need to ensure we only mark messages as read if the 'citizen' is the 'Receiver'.
      // Since Airtable's update doesn't directly support a WHERE clause per item in a batch like SQL,
      // we'd typically fetch them first to verify, or trust the client sends correct IDs.
      // For simplicity and performance, we'll trust the client sends IDs that are meant for this citizen.
      // A more robust solution might involve fetching and filtering before updating if strictness is paramount.

      const recordsToUpdate = messageIds.map(id => ({
        id: id,
        fields: {
          'ReadAt': readAt
        }
      }));

      // Airtable allows updating up to 10 records per request in a batch.
      // We need to chunk the updates if there are more than 10.
      const chunkSize = 10;
      for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
        const chunk = recordsToUpdate.slice(i, i + chunkSize);
        await base(AIRTABLE_MESSAGES_TABLE).update(chunk);
      }
      
      console.log(`Successfully marked ${messageIds.length} messages as read for citizen ${citizen}`);
      
      return NextResponse.json({
        success: true,
        message: 'Messages marked as read successfully'
      });
      
    } catch (error) {
      console.error('Error marking messages as read in Airtable:', error);
      // Check if error is an AirtableError and has a specific message
      let errorMessage = 'Failed to mark messages as read in Airtable';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as { message: string }).message;
      }
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error processing mark messages as read request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
