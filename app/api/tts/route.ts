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
    
    // Call the ElevenLabs API
    const response = await fetch('https://api.elevenlabs.io/v2/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '', // Make sure to set this in your .env file
      },
      body: JSON.stringify({
        text,
        voice_id,
        model,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('ElevenLabs API error:', errorData);
      return NextResponse.json(
        { success: false, error: `ElevenLabs API error: ${response.status}` },
        { status: response.status }
      );
    }
    
    // For simplicity, we'll return a JSON response with the audio URL
    // In a real implementation, you might want to stream the audio directly
    const ttsId = `tts_${Date.now()}`;
    
    return NextResponse.json({
      id: ttsId,
      status: 'success',
      text,
      audio_url: `/api/tts/${ttsId}/audio`, // This would be a real endpoint in a full implementation
      created_at: new Date().toISOString(),
      voice_id,
      model,
    });
    
  } catch (error) {
    console.error('Error in TTS API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process TTS request' },
      { status: 500 }
    );
  }
}
