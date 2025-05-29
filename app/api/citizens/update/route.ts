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
    if (data.coatOfArmsImageUrl !== undefined) updateFields.CoatOfArmsImageUrl = data.coatOfArmsImageUrl;
    if (data.telegramUserId !== undefined) updateFields.TelegramUserId = data.telegramUserId; // Ajout de TelegramUserId
        
    // Only proceed if there are fields to update
    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }
    
    // Update the citizen record
    const updatedRecord = await base(CITIZENS_TABLE).update(data.id, updateFields);

    // Send Telegram notification if TelegramUserId is present
    if (updatedRecord.fields.TelegramUserId) {
      const telegramUserId = updatedRecord.fields.TelegramUserId;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const messageText = `Your Serenissima citizen profile has been updated!`;

      if (botToken) {
        const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        try {
          const telegramResponse = await fetch(telegramApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: telegramUserId,
              text: messageText,
            }),
          });

          if (telegramResponse.ok) {
            console.log(`Successfully sent Telegram notification to ${telegramUserId}`);
          } else {
            const errorData = await telegramResponse.json();
            console.error(`Failed to send Telegram notification to ${telegramUserId}: ${telegramResponse.status}`, errorData);
          }
        } catch (telegramError) {
          console.error(`Error sending Telegram notification to ${telegramUserId}:`, telegramError);
        }
      } else {
        console.warn('TELEGRAM_BOT_TOKEN not set. Skipping Telegram notification.');
      }
    }
    
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
          if (updatedRecord.fields.TelegramUserId !== undefined) citizenUpdateFields.TelegramUserId = updatedRecord.fields.TelegramUserId; // Ajout de TelegramUserId
              
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
            Influence: 0,
            TelegramUserId: updatedRecord.fields.TelegramUserId !== undefined ? updatedRecord.fields.TelegramUserId : null, // Ajout de TelegramUserId
            CreatedAt: new Date().toISOString()
          };
          
          // Add image URL if coat of arms is available
          if (updatedRecord.fields.CoatOfArmsImageUrl) {
            citizenFields.ImageUrl = updatedRecord.fields.CoatOfArmsImageUrl;
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
    const responseCitizen: Record<string, any> = { id: updatedRecord.id };
    for (const key in updatedRecord.fields) {
      if (Object.prototype.hasOwnProperty.call(updatedRecord.fields, key)) {
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        responseCitizen[camelKey] = updatedRecord.fields[key];
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Citizen profile updated successfully',
      citizen: responseCitizen
    });
  } catch (error) {
    console.error('Error updating citizen profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update citizen profile' },
      { status: 500 }
    );
  }
}
