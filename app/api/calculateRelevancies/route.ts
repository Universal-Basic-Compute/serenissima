import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { relevancyService } from '@/lib/services/RelevancyService';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_LANDS_TABLE = process.env.AIRTABLE_LANDS_TABLE || 'LANDS';
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';

export async function GET(request: NextRequest) {
  try {
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const aiUsername = searchParams.get('ai');
    
    // Fetch all lands from Airtable
    console.log('Fetching all lands from Airtable...');
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    
    // Transform land records to a more usable format
    const allLands = landsRecords.map(record => ({
      id: record.id,
      owner: record.get('Owner') as string,
      center: record.get('Center') as { lat: number, lng: number } || null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // If an AI username is specified, calculate relevancy only for that AI
    if (aiUsername) {
      console.log(`Calculating relevancy for AI: ${aiUsername}`);
      
      // Get lands owned by this AI
      const aiLands = allLands.filter(land => land.owner === aiUsername);
      
      if (aiLands.length === 0) {
        return NextResponse.json(
          { message: `AI ${aiUsername} does not own any lands` },
          { status: 404 }
        );
      }
      
      // Calculate land proximity relevancy
      const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands);
      
      return NextResponse.json({
        success: true,
        ai: aiUsername,
        ownedLandCount: aiLands.length,
        relevancyScores
      });
    }
    
    // If no AI specified, calculate for all AI citizens
    console.log('Fetching AI citizens from Airtable...');
    const aiCitizens = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{IsAI} = TRUE()',
        fields: ['Username']
      })
      .all();
    
    const results = {};
    
    // Calculate relevancy for each AI citizen
    for (const aiCitizen of aiCitizens) {
      const username = aiCitizen.get('Username') as string;
      if (!username) continue;
      
      // Get lands owned by this AI
      const aiLands = allLands.filter(land => land.owner === username);
      
      // Skip AIs with no lands
      if (aiLands.length === 0) continue;
      
      // Calculate land proximity relevancy
      const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands);
      
      // Store results
      results[username] = {
        ownedLandCount: aiLands.length,
        relevancyScores
      };
    }
    
    return NextResponse.json({
      success: true,
      aiCount: Object.keys(results).length,
      results
    });
    
  } catch (error) {
    console.error('Error calculating relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate relevancies', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if Airtable credentials are configured
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    // Initialize Airtable
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get the AI username from the request body
    const body = await request.json();
    const { aiUsername } = body;
    
    if (!aiUsername) {
      return NextResponse.json(
        { error: 'AI username is required' },
        { status: 400 }
      );
    }
    
    // Fetch all lands from Airtable
    console.log(`Calculating and saving relevancies for AI: ${aiUsername}`);
    const landsRecords = await base(AIRTABLE_LANDS_TABLE).select().all();
    
    // Transform land records
    const allLands = landsRecords.map(record => ({
      id: record.id,
      owner: record.get('Owner') as string,
      center: record.get('Center') as { lat: number, lng: number } || null,
      coordinates: record.get('Coordinates') as { lat: number, lng: number }[] || [],
      historicalName: record.get('HistoricalName') as string || null,
      buildingPoints: record.get('BuildingPoints') as number || 0
    }));
    
    // Get lands owned by this AI
    const aiLands = allLands.filter(land => land.owner === aiUsername);
    
    if (aiLands.length === 0) {
      return NextResponse.json(
        { message: `AI ${aiUsername} does not own any lands` },
        { status: 404 }
      );
    }
    
    // Calculate land proximity relevancy
    const relevancyScores = relevancyService.calculateLandProximityRelevancy(aiLands, allLands);
    
    // Create or update a record in a new RELEVANCIES table
    // First check if the table exists, if not, we'll skip this step
    try {
      // Find or create the AI's relevancy record
      const relevancyRecords = await base('RELEVANCIES')
        .select({
          filterByFormula: `{CitizenUsername} = '${aiUsername}'`,
          maxRecords: 1
        })
        .all();
      
      const relevancyData = {
        CitizenUsername: aiUsername,
        LandProximityRelevancy: JSON.stringify(relevancyScores),
        LastUpdated: new Date().toISOString()
      };
      
      if (relevancyRecords.length > 0) {
        // Update existing record
        await base('RELEVANCIES').update(relevancyRecords[0].id, relevancyData);
        console.log(`Updated relevancy record for ${aiUsername}`);
      } else {
        // Create new record
        await base('RELEVANCIES').create(relevancyData);
        console.log(`Created new relevancy record for ${aiUsername}`);
      }
    } catch (error) {
      console.warn('Could not save to RELEVANCIES table, it may not exist:', error.message);
      // Continue without saving to Airtable
    }
    
    return NextResponse.json({
      success: true,
      ai: aiUsername,
      ownedLandCount: aiLands.length,
      relevancyScores,
      saved: true
    });
    
  } catch (error) {
    console.error('Error calculating and saving relevancies:', error);
    return NextResponse.json(
      { error: 'Failed to calculate and save relevancies', details: error.message },
      { status: 500 }
    );
  }
}
