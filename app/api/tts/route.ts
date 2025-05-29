import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text, voice_id = 'IKne3meq5aSn9XLyUdCD', model = 'eleven_flash_v2_5' } = await request.json();
    
    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      );
    }
    
    // Call the Kinos Engine API instead of ElevenLabs directly
    const response = await fetch('https://api.kinos-engine.ai/v2/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id,
        model,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Kinos Engine API error:', errorData);
      return NextResponse.json(
        { success: false, error: `Kinos Engine API error: ${response.status}` },
        { status: response.status }
      );
    }
    
    // Get the JSON response from Kinos Engine
    const data = await response.json();
    
    // Return the response directly
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error in TTS API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process TTS request' },
      { status: 500 }
    );
  }
}
