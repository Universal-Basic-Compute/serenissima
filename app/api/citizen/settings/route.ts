import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  Airtable.configure({
    apiKey: AIRTABLE_API_KEY
  });
  
  return Airtable.base(AIRTABLE_BASE_ID);
};

export async function POST(request: Request) {
  try {
    // Parse the request body
    const { wallet_address, settings } = await request.json();
    
    if (!wallet_address || !settings) {
      return NextResponse.json(
        { success: false, error: 'Wallet address and settings are required' },
        { status: 400 }
      );
    }
    
    console.log(`Updating settings for citizen with wallet: ${wallet_address}`, settings);
    
    try {
      // Initialize Airtable
      const base = initAirtable();
      
      // Find the citizen record by Username field instead of wallet_address
      // We're using the wallet_address as the username in this case
      const records = await base(AIRTABLE_CITIZENS_TABLE)
        .select({
          filterByFormula: `{Username} = '${wallet_address}'`,
          maxRecords: 1
        })
        .all();
      
      if (records.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Citizen not found' },
          { status: 404 }
        );
      }
      
      const citizenRecord = records[0];
      
      // Get existing preferences or initialize empty object
      let preferences = {};
      try {
        const existingPreferences = citizenRecord.get('Preferences');
        if (existingPreferences) {
          preferences = JSON.parse(existingPreferences as string);
        }
      } catch (error) {
        console.error('Error parsing existing preferences:', error);
      }
      
      // Merge new settings with existing preferences
      const updatedPreferences = {
        ...preferences,
        ...settings
      };
      
      // Update the citizen record with the merged preferences
      await base(AIRTABLE_CITIZENS_TABLE).update(citizenRecord.id, {
        'Preferences': JSON.stringify(updatedPreferences)
      });
      
      return NextResponse.json({
        success: true,
        message: 'Settings updated successfully'
      });
      
    } catch (error) {
      console.error('Error updating settings in Airtable:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update settings in Airtable' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
