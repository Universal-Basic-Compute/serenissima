import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }
    
    // In a real implementation, this would call an AI service
    // For now, we'll return predefined responses based on keywords
    
    let response = "I'm not sure how to respond to that. Perhaps you could ask about Venice's history, buildings, or economy?";
    
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('greetings')) {
      response = "Buongiorno! How may I assist you in navigating La Serenissima today?";
    } else if (lowerMessage.includes('building') || lowerMessage.includes('construct')) {
      response = "To construct buildings, you must first own land. Select a land parcel you own, then use the building menu to place various structures. Each building has different costs and benefits.";
    } else if (lowerMessage.includes('money') || lowerMessage.includes('ducats') || lowerMessage.includes('compute')) {
      response = "The economy of La Serenissima runs on $COMPUTE tokens. You can earn these through land ownership, building operations, and trade. Visit the marketplace to buy and sell assets.";
    } else if (lowerMessage.includes('land') || lowerMessage.includes('property')) {
      response = "Land in Venice is precious and limited. You can purchase available parcels in the marketplace. Prime locations near the Grand Canal command higher prices but may yield greater returns.";
    } else if (lowerMessage.includes('doge') || lowerMessage.includes('government')) {
      response = "Venice is governed by the Most Serene Republic, led by the Doge and the Council of Ten. As a noble, you may participate in governance by joining councils and voting on important matters.";
    }
    
    // Add a slight delay to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return NextResponse.json({
      success: true,
      response
    });
    
  } catch (error) {
    console.error('Error in Compagno API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
