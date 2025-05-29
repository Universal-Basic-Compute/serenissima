import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES'; // Make sure this matches your table name

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("FATAL: Airtable API Key or Base ID is not configured for relevancies/for-asset API.");
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// Helper function to escape single quotes in strings for Airtable formulas
const escapeAirtableString = (str: string | undefined | null): string => {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const assetType = searchParams.get('assetType');
    const relevantToCitizenUsername = searchParams.get('relevantToCitizen');

    if (!assetId || !assetType || !relevantToCitizenUsername) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required query parameters: assetId, assetType, and relevantToCitizen are required.' 
      }, { status: 400 });
    }

    const safeAssetId = escapeAirtableString(assetId);
    const safeAssetType = escapeAirtableString(assetType);
    const safeRelevantToCitizen = escapeAirtableString(relevantToCitizenUsername);

    // Construct the filter formula
    // Fetches relevancies where:
    // - The Asset matches assetId AND AssetType matches assetType
    // - AND (RelevantToCitizen matches the specific user OR RelevantToCitizen is 'all')
    const filterFormula = `AND({Asset} = '${safeAssetId}', {AssetType} = '${safeAssetType}', OR({RelevantToCitizen} = '${safeRelevantToCitizen}', {RelevantToCitizen} = 'all'))`;

    console.log(`[API RelevanciesForAsset] Fetching relevancies with filter: ${filterFormula}`);

    const records = await base(AIRTABLE_RELEVANCIES_TABLE)
      .select({
        filterByFormula: filterFormula,
        sort: [{ field: 'Score', direction: 'desc' }] // Sort by score descending
      })
      .all();

    const relevancies = records.map(record => ({
      id: record.id, // Airtable record ID
      relevancyId: record.get('RelevancyId'),
      asset: record.get('Asset'),
      assetType: record.get('AssetType'),
      category: record.get('Category'),
      type: record.get('Type'),
      targetCitizen: record.get('TargetCitizen'), // This might be null for asset-focused relevancies
      relevantToCitizen: record.get('RelevantToCitizen'),
      score: record.get('Score') || 0,
      timeHorizon: record.get('TimeHorizon'),
      title: record.get('Title') || 'Untitled Relevancy',
      description: record.get('Description') || 'No description available.',
      notes: record.get('Notes'),
      status: record.get('Status'),
      createdAt: record.get('CreatedAt')
    }));

    return NextResponse.json({
      success: true,
      relevancies,
      count: relevancies.length
    });

  } catch (error) {
    console.error('[API RelevanciesForAsset] Error fetching relevancies:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch relevancies for asset', 
      details: errorMessage 
    }, { status: 500 });
  }
}
