import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const KINOS_API_KEY = process.env.KINOS_API_KEY;
const KINOS_API_BASE_URL = "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins";

interface KinOSFile {
  path: string;
  type?: 'file' | 'directory'; // Type can be optional as per KinOS response for files
  size: number;
  last_modified: string;
  content?: string;      // Content of the file, if provided by KinOS
  is_binary?: boolean;   // Whether the content is binary
  // Fields for generated paintings
  url?: string;          // URL of the generated painting
  source: 'kinos' | 'generated_painting' | 'local'; // Source of the artwork
  // KinOS might include other fields, we'll pass them through
  [key: string]: any;
}

interface KinOSDirectoryContentResponse {
  path: string;
  is_directory: boolean; // Changed from type: 'directory'
  files: KinOSFile[];
  // KinOS might include other fields
  [key: string]: any;
}

interface ArtworkFile extends KinOSFile {
  name: string; // Extracted filename
  artist?: string; // Username of the artist
}

interface FormattedArtworksResponse {
  success: boolean;
  citizenUsername: string;
  artworksPath: string;
  artworks: ArtworkFile[];
  error?: string;
  details?: any;
  message?: string; // Added for consistency with other API responses
  debug?: any; // Added for consistency
}

// Helper function to extract title from Markdown content
function extractTitleFromContent(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('# ')) {
      return trimmedLine.substring(2).trim();
    }
  }
  return null;
}

// Helper function to format a filename into a title
function formatFilenameAsTitle(filenameWithExt: string): string {
  // Remove extension
  const filename = filenameWithExt.substring(0, filenameWithExt.lastIndexOf('.')) || filenameWithExt;
  // Replace underscores/hyphens with spaces, then capitalize each word
  return filename
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper function to fetch artworks for a single citizen
async function fetchArtworksForSingleCitizen(
  username: string,
  kinosArtPath: string,
  kinosApiKey: string
): Promise<ArtworkFile[]> {
  const kinosContentUrl = `${KINOS_API_BASE_URL}/${encodeURIComponent(username)}/content?path=${encodeURIComponent(kinosArtPath)}`;
  console.log(`[API /get-artworks] Fetching artworks for single citizen ${username} from KinOS: ${kinosContentUrl}`);

  try {
    const kinosResponse = await fetch(kinosContentUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kinosApiKey}`,
        'Accept': 'application/json',
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!kinosResponse.ok) {
      const errorText = await kinosResponse.text();
      let errorJson: any = null;
      try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }

      console.error(`[API /get-artworks] KinOS API error for ${username}: ${kinosResponse.status} - ${errorText}`);
      // For "kin not found" or "path not found", return empty array as it's not a fatal error for this specific citizen
      if (kinosResponse.status === 404 && errorJson && errorJson.error && errorJson.error.includes("not found")) {
        console.log(`[API /get-artworks] Kin or path not found for ${username}. Returning empty artworks for this citizen.`);
        return [];
      }
      // For other errors, we might still want to return empty for this citizen and let others proceed
      // Or throw to be caught by Promise.allSettled if we want more granular error reporting
      return []; // For now, return empty on error for this citizen
    }

    const kinosData: KinOSDirectoryContentResponse = await kinosResponse.json();

    if (kinosData.is_directory !== true || !Array.isArray(kinosData.files)) {
      console.error(`[API /get-artworks] Unexpected KinOS response format for ${username}. Expected directory with files array.`, kinosData);
      return []; // Return empty for this citizen on format error
    }

    return kinosData.files
      .filter(file => file.type !== 'directory' && !file.path.endsWith('/'))
      .map(file => {
        let artworkName = '';
        if (file.is_binary === false && file.content && typeof file.content === 'string') {
          const titleFromContent = extractTitleFromContent(file.content);
          if (titleFromContent) artworkName = titleFromContent;
        }
        if (!artworkName) {
          const pathParts = file.path.split('/');
          const filenameWithExt = pathParts.pop() || file.path;
          artworkName = formatFilenameAsTitle(filenameWithExt);
        }
        return { ...file, name: artworkName, artist: username, source: 'kinos' }; // Add source
      });
  } catch (error: any) {
    console.error(`[API /get-artworks] General error fetching KinOS artworks for citizen ${username}:`, error);
    return []; // Return empty for this citizen on general error
  }
}

// Interface for artworks from the Python backend
interface BackendArtwork {
  name: string;
  url: string;
  artist: string;
  activityId?: string;
  createdAt?: string;
}

// Helper function to fetch generated paintings from the Python backend
async function fetchGeneratedPaintingsFromBackend(
  citizenUsername?: string | null,
  specialty?: string | null
): Promise<ArtworkFile[]> {
  const pythonBackendUrl = 'https://backend.serenissima.ai';
  let backendApiUrl = `${pythonBackendUrl}/api/artworks`;
  const queryParams = new URLSearchParams();
  if (citizenUsername) {
    queryParams.append('citizen_username', citizenUsername);
  }
  if (specialty) {
    queryParams.append('specialty', specialty);
  }
  if (queryParams.toString()) {
    backendApiUrl += `?${queryParams.toString()}`;
  }

  console.log(`[API /get-artworks] Fetching generated paintings from Python backend: ${backendApiUrl}`);

  try {
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API /get-artworks] Python backend API error: ${response.status} - ${errorText}`);
      return [];
    }

    // Read response as text first to handle potential non-JSON error messages
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.warn(`[API /get-artworks] Python backend response was not valid JSON (status: ${response.status}). Response text (first 500 chars):`, responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
      // Attempt to extract error from <pre> tag if it looks like HTML
      if (responseText.trim().startsWith('<html')) {
        const preMatch = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
        if (preMatch && preMatch[1]) {
          let extractedError = preMatch[1];
          try {
            // Sometimes the <pre> content itself is JSON
            const preJson = JSON.parse(extractedError);
            if (preJson.detail) {
              extractedError = preJson.detail;
            }
          } catch (e) { /* not JSON, use as is */ }
          console.error(`[API /get-artworks] Extracted error from Python backend HTML response: ${extractedError}`);
        }
      }
      return []; // Return empty as we couldn't parse valid artwork data
    }

    if (data.success && Array.isArray(data.artworks)) {
      return data.artworks.map((artwork: BackendArtwork) => ({
        name: artwork.name,
        url: artwork.url,
        artist: artwork.artist,
        source: 'generated_painting',
        // Add other relevant fields if needed, e.g., createdAt
        createdAt: artwork.createdAt,
        activityId: artwork.activityId,
      }));
    }
    console.warn("[API /get-artworks] No generated paintings found or Python backend API response format unexpected.", data);
    return [];
  } catch (error: any) {
    console.error("[API /get-artworks] Error fetching generated paintings from Python backend:", error);
    return [];
  }
}


// Helper function to fetch local plays/artworks
async function fetchLocalArtworks(
  username?: string | null,
  specialty?: string | null
): Promise<ArtworkFile[]> {
  const localArtworks: ArtworkFile[] = [];
  
  // Determine which directory to check based on specialty
  let baseDir = '/mnt/c/Users/reyno/serenissima_/public/books'; // Default for books
  if (specialty?.toLowerCase() === 'playwright') {
    baseDir = '/mnt/c/Users/reyno/serenissima_/public/plays';
  } else if (specialty?.toLowerCase() === 'painter') {
    baseDir = '/mnt/c/Users/reyno/serenissima_/public/paintings';
  }
  
  try {
    // Check if the base directory exists
    await fs.access(baseDir);
    
    if (username) {
      // Look for specific user's works
      const userPaths = [
        path.join(baseDir, 'artisti', username),
        path.join(baseDir, username)
      ];
      
      for (const userPath of userPaths) {
        try {
          await fs.access(userPath);
          const files = await fs.readdir(userPath);
          
          for (const file of files) {
            if (file.endsWith('.md')) {
              const filePath = path.join(userPath, file);
              const content = await fs.readFile(filePath, 'utf-8');
              
              let artworkName = extractTitleFromContent(content) || formatFilenameAsTitle(file);
              
              localArtworks.push({
                name: artworkName,
                artist: username,
                path: path.relative('/mnt/c/Users/reyno/serenissima_/public', filePath),
                source: 'local',
                content: content,
                type: 'file',
                size: content.length,
                last_modified: new Date().toISOString()
              });
            }
          }
        } catch (e) {
          // Directory doesn't exist for this user, continue
        }
      }
    } else {
      // Fetch all artworks from all artists
      const scanDir = async (dir: string, depth = 0): Promise<void> => {
        if (depth > 3) return; // Limit recursion depth
        
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await scanDir(fullPath, depth + 1);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              // Try to extract artist from path
              const relativePath = path.relative(baseDir, fullPath);
              const pathParts = relativePath.split(path.sep);
              let artist = 'Unknown';
              
              if (pathParts.length >= 2) {
                if (pathParts[0] === 'artisti' && pathParts.length >= 3) {
                  artist = pathParts[1];
                } else if (pathParts.length === 2) {
                  artist = pathParts[0];
                }
              }
              
              const content = await fs.readFile(fullPath, 'utf-8');
              let artworkName = extractTitleFromContent(content) || formatFilenameAsTitle(entry.name);
              
              localArtworks.push({
                name: artworkName,
                artist: artist,
                path: path.relative('/mnt/c/Users/reyno/serenissima_/public', fullPath),
                source: 'local',
                content: content,
                type: 'file',
                size: content.length,
                last_modified: new Date().toISOString()
              });
            }
          }
        } catch (e) {
          console.error(`Error scanning directory ${dir}:`, e);
        }
      };
      
      await scanDir(baseDir);
    }
  } catch (e) {
    console.error(`Error accessing local artworks directory ${baseDir}:`, e);
  }
  
  return localArtworks;
}

// Helper function to fetch all Artisti usernames (for KinOS artworks)
async function fetchArtistiUsernames(specialty?: string | null): Promise<string[]> {
  let apiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/citizens?SocialClass=Artisti&IsAI=true`;
  if (specialty) {
    apiUrl += `&Specialty=${encodeURIComponent(specialty)}`;
  }
  console.log(`[API /get-artworks] Fetching Artisti citizens from: ${apiUrl}`);
  try {
    const response = await fetch(apiUrl, { next: { revalidate: 300 } }); // Cache for 5 minutes
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API /get-artworks] Failed to fetch Artisti citizens: ${response.status} - ${errorText}`);
      return [];
    }
    const data = await response.json();
    if (data.success && Array.isArray(data.citizens)) {
      return data.citizens.map((citizen: any) => citizen.username).filter((username: any) => typeof username === 'string');
    }
    console.warn("[API /get-artworks] No Artisti citizens found or API response format unexpected.", data);
    return [];
  } catch (error) {
    console.error("[API /get-artworks] Error fetching Artisti citizens:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const citizenUsernameParam = searchParams.get('citizen');
  const specialtyParam = searchParams.get('specialty');

  if (!KINOS_API_KEY) {
    console.error("[API /get-artworks] KINOS_API_KEY is not set.");
    return NextResponse.json({ success: false, error: 'Server configuration error: KinOS API key not set' }, { status: 500 });
  }

  const kinosArtPath = "AI-memories/art";

  if (citizenUsernameParam) {
    // Logic for a single specified citizen
    try {
      const [kinosArtworks, generatedPaintings, localArtworks] = await Promise.all([
        fetchArtworksForSingleCitizen(citizenUsernameParam, kinosArtPath, KINOS_API_KEY),
        fetchGeneratedPaintingsFromBackend(citizenUsernameParam, specialtyParam), // Pass specialty if available
        fetchLocalArtworks(citizenUsernameParam, specialtyParam)
      ]);
      
      const allArtworks = [...localArtworks, ...kinosArtworks, ...generatedPaintings];
      
      return NextResponse.json({
        success: true,
        citizenUsername: citizenUsernameParam,
        artworksPath: kinosArtPath, // KinOS path, generated paintings have full URLs
        artworks: allArtworks,
        message: `Found ${allArtworks.length} total artworks for ${citizenUsernameParam}. (${localArtworks.length} local, ${kinosArtworks.length} from KinOS, ${generatedPaintings.length} generated)`
      });
    } catch (error: any) {
      console.error(`[API /get-artworks] Error processing request for citizen ${citizenUsernameParam}:`, error);
      return NextResponse.json({ success: false, error: 'An unexpected error occurred', details: error.message }, { status: 500 });
    }
  } else {
    // Logic for fetching artworks from all Artisti (or by specialty)
    const logMessageAction = specialtyParam ? `Fetching artworks for Artisti with specialty '${specialtyParam}'.` : "Fetching artworks for all Artisti.";
    console.log(`[API /get-artworks] No specific citizen. ${logMessageAction}`);
    try {
      // Fetch KinOS artworks
      const artistiUsernamesForKinOS = await fetchArtistiUsernames(specialtyParam);
      let kinosArtworks: ArtworkFile[] = [];
      if (artistiUsernamesForKinOS.length > 0) {
        const kinosArtworksPromises = artistiUsernamesForKinOS.map(username =>
          fetchArtworksForSingleCitizen(username, kinosArtPath, KINOS_API_KEY)
        );
        const kinosResults = await Promise.all(kinosArtworksPromises);
        kinosArtworks = kinosResults.flat();
      }

      // Fetch generated paintings from backend
      // If specialtyParam is provided, backend will filter by it. Otherwise, backend defaults (e.g., to Painters).
      const generatedPaintings = await fetchGeneratedPaintingsFromBackend(null, specialtyParam);
      
      // Fetch local artworks
      const localArtworks = await fetchLocalArtworks(null, specialtyParam);
      
      const allArtworks = [...localArtworks, ...kinosArtworks, ...generatedPaintings];
      
      const responseCitizenIdentifier = specialtyParam 
        ? `all_artisti_${specialtyParam.toLowerCase().replace(/\s+/g, '_')}` 
        : "all_artisti";

      if (allArtworks.length === 0 && artistiUsernamesForKinOS.length === 0 && generatedPaintings.length === 0) {
         const message = specialtyParam 
          ? `No Artisti citizens found with specialty '${specialtyParam}' and no generated paintings for this specialty.`
          : "No Artisti citizens found and no generated paintings.";
        return NextResponse.json({
          success: true,
          citizenUsername: responseCitizenIdentifier,
          artworksPath: kinosArtPath,
          artworks: [],
          message: message
        });
      }
      
      return NextResponse.json({
        success: true,
        citizenUsername: responseCitizenIdentifier,
        artworksPath: kinosArtPath,
        artworks: allArtworks,
        message: `Found ${allArtworks.length} total artworks. (${localArtworks.length} local, ${kinosArtworks.length} from KinOS for ${artistiUsernamesForKinOS.length} artists, ${generatedPaintings.length} generated paintings from backend).`
      });

    } catch (error: any) {
      console.error(`[API /get-artworks] Error processing request for all Artisti:`, error);
      return NextResponse.json({ success: false, error: 'An unexpected error occurred while fetching artworks', details: error.message }, { status: 500 });
    }
  }
}
