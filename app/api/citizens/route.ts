import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // In a real application, you would fetch this data from your database
    // This is just example data with historically accurate Venetian social classes
    const citizens = [
      {
        CitizenId: "cit-001",
        SocialClass: "Nobili",
        FirstName: "Marco",
        LastName: "Contarini",
        Description: "A wealthy patrician from one of Venice's oldest families. Marco serves on the Council of Ten and has significant investments in the spice trade.",
        ImageUrl: "/images/citizens/noble1.jpg",
        Wealth: "High",
        Home: "bldg-001", // ID of a palace building
        Work: "bus-001", // ID of a government office
        NeedsCompletionScore: 0.95,
        CreatedAt: "2023-01-15T10:30:00Z"
      },
      {
        CitizenId: "cit-002",
        SocialClass: "Cittadini",
        FirstName: "Giovanni",
        LastName: "Bellini",
        Description: "A successful merchant who trades primarily in silk and glass. His family has been in the trade for three generations.",
        ImageUrl: "/images/citizens/merchant1.jpg",
        Wealth: "Medium-High",
        Home: "bldg-002", // ID of a merchant house
        Work: "bus-002", // ID of a trading post
        NeedsCompletionScore: 0.82,
        CreatedAt: "2023-02-10T14:45:00Z"
      },
      {
        CitizenId: "cit-003",
        SocialClass: "Popolani",
        FirstName: "Lucia",
        LastName: "Venier",
        Description: "A skilled glassmaker from Murano. Her delicate glass beads and figurines are sought after by nobles throughout Europe.",
        ImageUrl: "/images/citizens/artisan1.jpg",
        Wealth: "Medium",
        Home: "bldg-003", // ID of an artisan dwelling
        Work: "bus-003", // ID of a glassmaking workshop
        NeedsCompletionScore: 0.78,
        CreatedAt: "2023-01-28T09:15:00Z"
      },
      {
        CitizenId: "cit-004",
        SocialClass: "Popolani",
        FirstName: "Antonio",
        LastName: "Rizzo",
        Description: "A fisherman who supplies fresh catch to the Rialto Market. He comes from a long line of Venetian fishermen.",
        ImageUrl: "/images/citizens/commoner1.jpg",
        Wealth: "Low-Medium",
        Home: "bldg-004", // ID of a modest dwelling
        Work: "bus-004", // ID of a fishing boat
        NeedsCompletionScore: 0.65,
        CreatedAt: "2023-03-05T07:30:00Z"
      },
      {
        CitizenId: "cit-005",
        SocialClass: "Facchini",
        FirstName: "Maria",
        LastName: "Foscari",
        Description: "A household servant in the employ of the Contarini family. She manages the domestic staff and oversees the daily operations of the household.",
        ImageUrl: "/images/citizens/servant1.jpg",
        Wealth: "Low",
        Home: "bldg-001", // Same as Marco Contarini (she lives in the servants' quarters)
        Work: "bldg-001", // She works in the same building
        NeedsCompletionScore: 0.58,
        CreatedAt: "2023-02-20T11:00:00Z"
      }
    ];
    
    return NextResponse.json(citizens);
  } catch (error) {
    console.error('Error fetching citizens:', error);
    return NextResponse.json(
      { error: 'Failed to fetch citizens data' },
      { status: 500 }
    );
  }
}
