import { NextResponse } from 'next/server';
import { relevancyService } from '@/lib/services/RelevancyService';

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const calculateAll = searchParams.get('calculateAll') === 'true';
    const relevantToCitizen = searchParams.get('relevantToCitizen');
    const assetType = searchParams.get('assetType');
    
    if (calculateAll) {
      // Redirect to the calculateAll endpoint
      return NextResponse.redirect(new URL('/api/calculateRelevancies?calculateAll=true', request.url));
    }
    
    // If requesting citizen relevancies
    if (relevantToCitizen && assetType === 'citizen') {
      // In a real implementation, you would fetch this data from a database
      // For now, we'll return mock data
      const mockRelevancies = [
        {
          relevancyId: "rel_001",
          assetId: "ctz_001",
          assetType: "citizen",
          category: "social",
          type: "friendship",
          targetCitizen: "Marco_Polo",
          relevantToCitizen: relevantToCitizen,
          score: 0.85,
          timeHorizon: "long-term",
          title: "Amico Fidato",
          description: "Un'amicizia di lunga data che ha resistito alla prova del tempo.",
          notes: "Frequenti incontri al Caffè Florian",
          createdAt: "2023-05-15T10:30:00Z",
          status: "active"
        },
        {
          relevancyId: "rel_002",
          assetId: "ctz_002",
          assetType: "citizen",
          category: "business",
          type: "rivalry",
          targetCitizen: "Antonio_Vivaldi",
          relevantToCitizen: relevantToCitizen,
          score: 0.65,
          timeHorizon: "medium-term",
          title: "Rivale Commerciale",
          description: "Competizione nel commercio di spezie dall'Oriente.",
          notes: "Tensione crescente negli ultimi mesi",
          createdAt: "2023-06-20T14:45:00Z",
          status: "active"
        },
        {
          relevancyId: "rel_003",
          assetId: "ctz_003",
          assetType: "citizen",
          category: "political",
          type: "alliance",
          targetCitizen: "Caterina_Cornaro",
          relevantToCitizen: relevantToCitizen,
          score: 0.92,
          timeHorizon: "long-term",
          title: "Alleanza Politica",
          description: "Supporto reciproco nelle questioni del Consiglio dei Dieci.",
          notes: "Alleanza formata durante la crisi di Cipro",
          createdAt: "2023-04-10T09:15:00Z",
          status: "active"
        }
      ];
      
      return NextResponse.json({
        success: true,
        relevancies: mockRelevancies
      });
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
