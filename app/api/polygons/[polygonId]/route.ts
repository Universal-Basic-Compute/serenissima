import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// In-memory cache for polygons
let polygonsCache: Record<string, any> = {};
let cacheTimestamp: number = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 🔍 Extraire l'ID depuis l'URL
    const match = request.nextUrl.pathname.match(/\/api\/polygons\/([^/]+)/);
    const polygonId = match?.[1];

    if (!polygonId) {
      return NextResponse.json({ error: 'Polygon ID is missing' }, { status: 400 });
    }

    //console.log(`Fetching polygon with ID: ${polygonId}`);

    // ✅ Vérifier dans le cache
    if (polygonsCache[polygonId]) {
      console.log(`Returning polygon ${polygonId} from cache.`);
      return NextResponse.json(polygonsCache[polygonId]);
    }

    const dataDir = path.join(process.cwd(), 'data', 'polygons');
    const specificPolygonPath = path.join(dataDir, `${polygonId}.json`);

    // ✅ Charger fichier spécifique
    if (fs.existsSync(specificPolygonPath)) {
      try {
        const fileContent = fs.readFileSync(specificPolygonPath, 'utf8');
        const polygonData = JSON.parse(fileContent);
        polygonsCache[polygonId] = polygonData; // Cache it
        console.log(`Found and cached polygon ${polygonId} from specific file.`);
        return NextResponse.json(polygonData);
      } catch (parseError) {
        console.error(`Error parsing specific polygon file ${specificPolygonPath}:`, parseError);
        // Potentially fall through to other methods or return error, for now, fall through
      }
    }

    // ✅ Sinon charger fichier global (polygons.json)
    const allPolygonsPath = path.join(dataDir, 'polygons.json');
    if (fs.existsSync(allPolygonsPath)) {
      console.log(`Specific file for ${polygonId} not found or failed to parse. Trying ${allPolygonsPath}...`);
      try {
        const fileContent = fs.readFileSync(allPolygonsPath, 'utf8');
        const allPolygonsData = JSON.parse(fileContent);
        const polygonsArray = Array.isArray(allPolygonsData) ? allPolygonsData : (allPolygonsData.polygons && Array.isArray(allPolygonsData.polygons) ? allPolygonsData.polygons : null);

        if (polygonsArray) {
          // Populate cache with all polygons from this file for future requests
          polygonsArray.forEach(p => { if (p && p.id) polygonsCache[p.id] = p; });
          
          const foundPolygon = polygonsArray.find(p => p && p.id === polygonId);
          if (foundPolygon) {
            console.log(`Found polygon ${polygonId} in ${allPolygonsPath} and cached all its polygons.`);
            return NextResponse.json(foundPolygon);
          }
        } else {
          console.warn(`${allPolygonsPath} does not contain a recognized array of polygons.`);
        }
      } catch (parseError) {
        console.error(`Error parsing ${allPolygonsPath}:`, parseError);
      }
    }

    // ✅ Si toujours pas trouvé, scanner tous les autres fichiers .json dans le répertoire
    console.log(`Polygon ${polygonId} not found in cache, specific file, or main polygons.json. Scanning directory...`);
    try {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== `${polygonId}.json` && file !== 'polygons.json') {
          const filePath = path.join(dataDir, file);
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            const polygonsInFile = Array.isArray(data) ? data : (data.polygons && Array.isArray(data.polygons) ? data.polygons : null);

            if (polygonsInFile) {
              const foundPolygon = polygonsInFile.find(p => p && p.id === polygonId);
              if (foundPolygon) {
                // Cache all polygons from this file as well
                polygonsInFile.forEach(p => { if (p && p.id && !polygonsCache[p.id]) polygonsCache[p.id] = p; });
                console.log(`Found polygon ${polygonId} in ${file}. Cached its contents.`);
                return NextResponse.json(foundPolygon);
              }
            }
          } catch (scanParseError) {
            console.error(`Error parsing file ${filePath} during directory scan:`, scanParseError);
            // Continue to next file
          }
        }
      }
    } catch (dirReadError) {
        console.error(`Error reading polygons directory ${dataDir}:`, dirReadError);
        // If directory cannot be read, we cannot proceed with scanning.
        // Fall through to the "not found" error, or could return a 500 here.
    }
    

    // ❌ Si toujours rien trouvé
    console.log(`Polygon ${polygonId} not found after all checks.`);
    return NextResponse.json({ error: `Polygon ${polygonId} not found` }, { status: 404 });

  } catch (error) {
    // This outer catch is for unexpected errors not caught by inner handlers
    console.error(`Critical error fetching polygon ${request.nextUrl.pathname}:`, error);
    return NextResponse.json({ error: 'Failed to fetch polygon' }, { status: 500 });
  }
}
