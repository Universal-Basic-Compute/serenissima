import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[music-tracks API] Le gestionnaire GET a été invoqué.'); // Log de confirmation
  try {
    // Always use the production backend to list music files.
    const pythonBackendUrl = 'https://backend.serenissima.ai';

    const listFilesUrl = `${pythonBackendUrl}/api/list-music-files`;
    
    console.log(`[music-tracks API] Fetching music file list from: ${listFilesUrl}`);
    const response = await fetch(listFilesUrl, { cache: 'no-store' }); // Ensure fresh data

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[music-tracks API] Error fetching file list from backend: ${response.status} ${response.statusText} - ${errorText}`);
      return NextResponse.json(
        { success: false, error: `Failed to fetch music list from backend: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.files)) {
      console.error('[music-tracks API] Backend did not return a successful list of files:', data);
      return NextResponse.json(
        { success: false, error: 'Invalid response from music file list backend', details: data.error || 'No files array' },
        { status: 500 }
      );
    }
    
    const backendAssetBaseUrl = process.env.BACKEND_PUBLIC_ASSETS_URL || 'https://backend.serenissima.ai/public_assets';

    // Construct full URLs for each track
    const tracks = data.files.map((file: string) => `${backendAssetBaseUrl}/music/${file}`);
    
    console.log(`[music-tracks API] Successfully fetched ${tracks.length} tracks.`);
    return NextResponse.json({ success: true, tracks: tracks });

  } catch (error: any) {
    console.error('[music-tracks API] Error getting music tracks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get music tracks' },
      { status: 500 }
    );
  }
}
