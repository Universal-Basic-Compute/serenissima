import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the data directory path
const DATA_DIR = path.join(process.cwd(), 'data');

export async function GET() {
  try {
    console.log('Fetching all building points...');
    
    // Initialize collections for different point types
    const buildingPoints: Record<string, { lat: number, lng: number }> = {};
    const canalPoints: Record<string, { lat: number, lng: number }> = {};
    const bridgePoints: Record<string, { lat: number, lng: number }> = {};
    
    // Read all polygon files in the data directory
    const files = fs.readdirSync(DATA_DIR).filter(file => 
      file.endsWith('.json') && !file.startsWith('index')
    );
    
    // Process each polygon file
    for (const file of files) {
      try {
        const filePath = path.join(DATA_DIR, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const polygon = JSON.parse(fileContent);
        
        // Process regular building points
        if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
          polygon.buildingPoints.forEach((point: any) => {
            if (point && point.lat && point.lng) {
              const pointId = point.id || `point-${point.lat}-${point.lng}`;
              buildingPoints[pointId] = { lat: point.lat, lng: point.lng };
            }
          });
        }
        
        // Process canal points
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (point && point.edge && point.edge.lat && point.edge.lng) {
              const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
              canalPoints[pointId] = { lat: point.edge.lat, lng: point.edge.lng };
            }
          });
        }
        
        // Process bridge points
        if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
          polygon.bridgePoints.forEach((point: any) => {
            if (point && point.edge && point.edge.lat && point.edge.lng) {
              const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
              bridgePoints[pointId] = { lat: point.edge.lat, lng: point.edge.lng };
            }
          });
        }
      } catch (error) {
        console.error(`Error processing polygon file ${file}:`, error);
      }
    }
    
    // Return all point collections
    return NextResponse.json({
      success: true,
      buildingPoints,
      canalPoints,
      bridgePoints,
      totalPoints: Object.keys(buildingPoints).length + 
                  Object.keys(canalPoints).length + 
                  Object.keys(bridgePoints).length
    });
  } catch (error) {
    console.error('Error fetching building points:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building points' },
      { status: 500 }
    );
  }
}
