import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID || '');

const USERS_TABLE = 'USERS';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.id) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
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
    
    // Update the user record
    const updatedRecord = await base(USERS_TABLE).update(data.id, updateFields);
    
    // Return the updated user data
    return NextResponse.json({
      success: true,
      message: 'User profile updated successfully',
      user: {
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
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}
