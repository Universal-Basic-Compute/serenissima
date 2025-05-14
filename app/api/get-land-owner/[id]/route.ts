import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const landId = params.id;
    
    if (!landId) {
      return NextResponse.json(
        { success: false, error: 'Land ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching owner for land ID: ${landId}`);
    
    // Fetch all land owners
    const ownersResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-land-owners`);
    
    if (!ownersResponse.ok) {
      throw new Error(`Failed to fetch land owners: ${ownersResponse.status}`);
    }
    
    const ownersData = await ownersResponse.json();
    
    if (ownersData.lands && Array.isArray(ownersData.lands)) {
      // Find the land with the matching ID
      const land = ownersData.lands.find((land: any) => land.id === landId);
      
      if (land && land.owner) {
        return NextResponse.json({
          success: true,
          owner: land.owner
        });
      } else {
        return NextResponse.json({
          success: false,
          error: `No owner found for land ID: ${landId}`
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid land owners data format'
      });
    }
  } catch (error) {
    console.error('Error fetching land owner:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch land owner' },
      { status: 500 }
    );
  }
}
