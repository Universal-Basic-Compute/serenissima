import { NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const calculateAll = searchParams.get('calculateAll') === 'true';
    
    if (calculateAll) {
      // Redirect to the calculateAll endpoint
      return NextResponse.redirect(new URL('/api/calculateRelevancies?calculateAll=true', request.url));
    }
    
    // Return available relevancy types
    return NextResponse.json({
      success: true,
      availableTypes: [
        {
          name: 'proximity',
          description: 'Land proximity relevancy based on geographic distance and connectivity',
          subtypes: ['connected', 'geographic']
        },
        {
          name: 'domination',
          description: 'Land domination relevancy based on ownership and building points',
          subtypes: ['landowner']
        }
      ]
    });
  } catch (error) {
    console.error('Error in relevancies endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process relevancies request', details: error.message },
      { status: 500 }
    );
  }
}
