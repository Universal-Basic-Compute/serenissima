import { NextResponse } from 'next/server';
import fs from 'fs/promises'; // Use promises version of fs for async/await
import path from 'path';

const WATER_GRAPH_FILE_PATH = path.join(process.cwd(), 'data', 'watergraph.json');

export async function GET(request: Request) {
  try {
    // Check if the file exists
    try {
      await fs.access(WATER_GRAPH_FILE_PATH);
    } catch (error) {
      console.error(`Water graph file not found: ${WATER_GRAPH_FILE_PATH}`, error);
      return NextResponse.json(
        { success: false, error: 'Water graph data file not found.' },
        { status: 404 }
      );
    }

    // Read the file content
    const fileContent = await fs.readFile(WATER_GRAPH_FILE_PATH, 'utf8');
    
    // Parse the JSON content
    const waterGraphData = JSON.parse(fileContent);

    // Log successful data retrieval
    const numWaterPoints = waterGraphData?.waterPoints?.length || 0;
    const numWaterEdges = waterGraphData?.waterEdges?.length || 0;
    console.log(`Successfully loaded water graph data: ${numWaterPoints} water points, ${numWaterEdges} water edges.`);

    return NextResponse.json({
      success: true,
      waterGraph: waterGraphData,
    });

  } catch (error) {
    console.error('Error fetching water graph data:', error);
    // Differentiate between file parsing error and other errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: 'Failed to parse water graph data file (invalid JSON).' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to fetch water graph data.' },
      { status: 500 }
    );
  }
}
