import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getApiBaseUrl } from '@/lib/apiUtils';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { owner, wallet } = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    if (!owner && !wallet) {
      return NextResponse.json(
        { success: false, error: 'Owner or wallet is required' },
        { status: 400 }
      );
    }
    
    // Try to update via the backend API
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/api/land`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          land_id: id,
          user: owner,
          wallet_address: wallet || owner
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Also update the local file if it exists
        try {
          // Try multiple possible file paths for the land data
          const possiblePaths = [
            path.join(process.cwd(), 'data', `${id}.json`),
            path.join(process.cwd(), 'data', `polygon-${id}.json`)
          ];
          
          for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
              const landContent = fs.readFileSync(filePath, 'utf8');
              let land = JSON.parse(landContent);
              
              // Handle different land data formats
              if (Array.isArray(land)) {
                // Old format - just coordinates array
                // Convert to new format with owner
                land = {
                  coordinates: land,
                  owner: owner
                };
              } else {
                // New format - update owner
                land.owner = owner;
              }
              
              // Save the updated land
              fs.writeFileSync(filePath, JSON.stringify(land, null, 2));
              console.log(`Local land file updated for ${id}`);
            }
          }
        } catch (fileError) {
          console.error(`Error updating local land file for ${id}:`, fileError);
          // Continue even if local file update fails
        }
        
        return NextResponse.json(data);
      }
      
      // If backend API fails, return the error
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: errorData.detail || 'Failed to update land' },
        { status: response.status }
      );
    } catch (apiError) {
      console.warn('Backend API not available, falling back to local update:', apiError);
      
      // Try to update the local file
      try {
        // Try multiple possible file paths for the land data
        const possiblePaths = [
          path.join(process.cwd(), 'data', `${id}.json`),
          path.join(process.cwd(), 'data', `polygon-${id}.json`)
        ];
        
        let updated = false;
        
        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            const landContent = fs.readFileSync(filePath, 'utf8');
            let land = JSON.parse(landContent);
            
            // Handle different land data formats
            if (Array.isArray(land)) {
              // Old format - just coordinates array
              // Convert to new format with owner
              land = {
                coordinates: land,
                owner: owner
              };
            } else {
              // New format - update owner
              land.owner = owner;
            }
            
            // Save the updated land
            fs.writeFileSync(filePath, JSON.stringify(land, null, 2));
            console.log(`Local land file updated for ${id}`);
            updated = true;
          }
        }
        
        if (updated) {
          return NextResponse.json({
            success: true,
            message: 'Land ownership updated locally',
            id,
            owner
          });
        } else {
          return NextResponse.json(
            { success: false, error: 'Land file not found' },
            { status: 404 }
          );
        }
      } catch (fileError) {
        console.error(`Error updating local land file for ${id}:`, fileError);
        return NextResponse.json(
          { success: false, error: 'Failed to update land file' },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Error updating land:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update land' },
      { status: 500 }
    );
  }
}
