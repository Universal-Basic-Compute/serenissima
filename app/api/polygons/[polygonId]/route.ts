import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let polygonsCache: Record<string, any> = {};
let cacheTimestamp: number = 0;

export async function GET(
  request: NextRequest,
  context: { params: { polygonId: string } }
): Promise<NextResponse> {
  try {
    const polygonId = context.params.polygonId;
    console.log(`Fetching polygon with ID: ${polygonId}`);

    if (Object.keys(polygonsCache).length > 0 && polygonsCache[polygonId]) {
      console.log(`Returning polygon ${polygonId} from cache`);
      return NextResponse.json(polygonsCache[polygonId]);
    }

    const dataDir = path.join(process.cwd(), 'data', 'polygons');
    const specificPolygonPath = path.join(dataDir, `${polygonId}.json`);

    if (fs.existsSync(specificPolygonPath)) {
      try {
        const polygonData = JSON.parse(fs.readFileSync(specificPolygonPath, 'utf8'));
        polygonsCache[polygonId] = polygonData;
        return NextResponse.json(polygonData);
      } catch (error) {
        console.error(`Error reading polygon file ${specificPolygonPath}:`, error);
      }
    }

    console.log(`Polygon file not found, searching in all polygons...`);
    const allPolygonsPath = path.join(dataDir, 'polygons.json');

    if (fs.existsSync(allPolygonsPath)) {
      try {
        const allPolygons = JSON.parse(fs.readFileSync(allPolygonsPath, 'utf8'));

        if (Array.isArray(allPolygons)) {
          const polygon = allPolygons.find(p => p.id === polygonId);
          if (polygon) {
            allPolygons.forEach(p => { if (p.id) polygonsCache[p.id] = p; });
            return NextResponse.json(polygon);
          }
        } else if (allPolygons.polygons && Array.isArray(allPolygons.polygons)) {
          const polygon = allPolygons.polygons.find(p => p.id === polygonId);
          if (polygon) {
            allPolygons.polygons.forEach(p => { if (p.id) polygonsCache[p.id] = p; });
            return NextResponse.json(polygon);
          }
        }
      } catch (error) {
        console.error(`Error reading all polygons file:`, error);
      }
    }

    console.log(`Scanning polygons directory for polygon files...`);
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(dataDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);

        if (data.id === polygonId) {
          polygonsCache[polygonId] = data;
          return NextResponse.json(data);
        }

        if (Array.isArray(data)) {
          const polygon = data.find(p => p.id === polygonId);
          if (polygon) {
            data.forEach(p => { if (p.id) polygonsCache[p.id] = p; });
            return NextResponse.json(polygon);
          }
        }

        if (data.polygons && Array.isArray(data.polygons)) {
          const polygon = data.polygons.find(p => p.id === polygonId);
          if (polygon) {
            data.polygons.forEach(p => { if (p.id) polygonsCache[p.id] = p; });
            return NextResponse.json(polygon);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
      }
    }

    console.log(`Polygon ${polygonId} not found`);
    return NextResponse.json({ error: `Polygon ${polygonId} not found` }, { status: 404 });

  } catch (error) {
    console.error('Error fetching polygon:', error);
    return NextResponse.json({ error: 'Failed to fetch polygon' }, { status: 500 });
  }
}
