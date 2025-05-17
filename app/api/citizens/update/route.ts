import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const CITIZENS_TABLE = 'CITIZENS';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id) {
      return NextResponse.json(
        { success: false, error: 'Citizen ID is required' },
        { status: 400 }
      );
    }
    
    // Create an object with only the fields to update
    const updateFields: Record<string, any> = {};
    
    if (data.username !== undefined) updateFields.Username = data.username;
    if (data.firstName !== undefined) updateFields.FirstName = data.firstName;
    if (data.lastName !== undefined) updateFields.LastName = data.lastName;
    if (data.familyMotto !== undefined) updateFields.FamilyMotto = data.familyMotto;
    if (data.coatOfArmsImage !== undefined) updateFields.CoatOfArmsImage = data.coatOfArmsImage;
    
    // Only proceed if there are fields to update
    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }
    
    // Update the citizen record
    const updatedRecord = await base(CITIZENS_TABLE).update(data.id, updateFields);
    
    // Now handle the citizen record
    try {
      // First, check if a citizen with this username already exists
      const username = updatedRecord.fields.Username;
      
      if (username) {
        const existingCitizens = await base(CITIZENS_TABLE)
          .select({
            filterByFormula: `{Username} = "${username}"`,
            maxRecords: 1
          })
          .firstPage();
        
        // Default position for new citizens
        const defaultPosition = JSON.stringify({
          lat: 45.440840,
          lng: 12.327785
        });
        
        if (existingCitizens && existingCitizens.length > 0) {
          // Update existing citizen
          const citizenId = existingCitizens[0].id;
          
          // Create citizen update fields
          const citizenUpdateFields: Record<string, any> = {};
          
          if (updatedRecord.fields.Username) citizenUpdateFields.Username = updatedRecord.fields.Username;
          if (updatedRecord.fields.FirstName) citizenUpdateFields.FirstName = updatedRecord.fields.FirstName;
          if (updatedRecord.fields.LastName) citizenUpdateFields.LastName = updatedRecord.fields.LastName;
          
          // Update the citizen record
          await base(CITIZENS_TABLE).update(citizenId, citizenUpdateFields);
          console.log(`Updated citizen record for ${username}`);
        } else {
          // Create new citizen record
          const citizenId = `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          
          // Create citizen fields
          const citizenFields: Record<string, any> = {
            CitizenId: citizenId,
            Username: updatedRecord.fields.Username,
            FirstName: updatedRecord.fields.FirstName || 'Unknown',
            LastName: updatedRecord.fields.LastName || 'Citizen',
            SocialClass: 'Facchini', // Default social class
            Description: `A citizen of Venice.`,
            Position: defaultPosition,
            Ducats: 0,
            Prestige: 0,
            CreatedAt: new Date().toISOString()
          };
          
          // Add image URL if coat of arms is available
          if (updatedRecord.fields.CoatOfArmsImage) {
            citizenFields.ImageUrl = updatedRecord.fields.CoatOfArmsImage;
          }
          
          // Create the citizen record
          await base(CITIZENS_TABLE).create(citizenFields);
          console.log(`Created new citizen record for ${username}`);
        }
      }
    } catch (citizenError) {
      // Log the error but don't fail the citizen update
      console.error('Error updating/creating citizen record:', citizenError);
    }
    
    // Return the updated citizen data
    return NextResponse.json({
      success: true,
      message: 'Citizen profile updated successfully',
      citizen: {
        id: updatedRecord.id,
        walletAddress: updatedRecord.fields.Wallet,
        username: updatedRecord.fields.Username || null,
        firstName: updatedRecord.fields.FirstName || null,
        lastName: updatedRecord.fields.LastName || null,
        ducats: updatedRecord.fields.Ducats || 0,
        coatOfArmsImage: updatedRecord.fields.CoatOfArmsImage || null,
        familyMotto: updatedRecord.fields.FamilyMotto || null,
        createdAt: updatedRecord.fields.CreatedAt || null
      }
    });
  } catch (error) {
    console.error('Error updating citizen profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update citizen profile' },
      { status: 500 }
    );
  }
}
