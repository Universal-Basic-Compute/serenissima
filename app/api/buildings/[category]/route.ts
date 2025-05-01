import { NextResponse } from 'next/server';

// Import the residential building data
// We're using the data that was already provided in the chat
const residentialBuildings = [
  {
    "name": "Fisherman's Cottage",
    "category": "Residential",
    "subcategory": "Basic Residences",
    "tier": 1,
    "size": "Small",
    "unlockCondition": "None - available from start",
    
    "shortDescription": "Simple wooden home for working class citizens near the water.",
    "fullDescription": "A modest wooden structure housing Venice's vital fishing families. These humble cottages typically include a ground floor for nets and equipment with living quarters above. The proximity to water is essential for their livelihood.",
    "flavorText": "The fishermen rise before the bells of San Marco, for the lagoon's bounty favors the early and the bold.",
    
    "constructionCosts": {
      "ducats": 800,
      "timber": 50,
      "bricks": 20
    },
    "maintenanceCost": 5,
    "constructionTime": 172800000,
    "incomeGeneration": 10,
    "residentsCapacity": 4,
    
    "locationRequirements": {
      "districtRestrictions": "Cannot be built in San Marco or Rialto",
      "adjacentRequirements": "Must be within 3 tiles of water",
      "environmentalEffects": "No effect on surrounding buildings"
    },
    
    "constructionPhase3DPrompt": "Renaissance Venetian fisherman's cottage under construction, simple wooden frame structure being built, partial timber walls, thatched roof partially completed, small construction site with basic tools, wooden ladder, timber piles nearby, modest size, located near water edge, small dock being constructed, workers installing window frames, historically accurate but simply designed, isometric game perspective, stylized but detailed, weathered wood textures",
    
    "completedBuilding3DPrompt": "Completed Renaissance Venetian fisherman's cottage, small wooden structure with stone foundation, weathered wooden exterior, red tile roof with slight moss, small windows with wooden shutters, modest fishing dock attached, fishing nets hanging to dry, simple wooden door, smoke from small chimney, elevated first floor with storage space beneath, historically accurate but slightly stylized for game aesthetic, isometric game perspective, warm weathered wood textures, small boat tied nearby, humble but charming",
    
    "gameplayInformation": {
      "unlocks": ["Basic Fishing Operations"],
      "specialAbilities": ["Provides modest housing for working class", "Can serve as small fishing operation base"],
      "upgradePath": ["Artisan's House"],
      "reputationEffects": {
        "Fisher's Guild": 5,
        "Nobility": -2
      },
      "riskFactors": {
        "fireRisk": "High (wooden structure)",
        "floodRisk": "High (near water)",
        "crimeRisk": "Low"
      }
    },
    
    "soundDesign": {
      "ambientSound": "Gentle water lapping, occasional seagulls",
      "activitySounds": "Net mending, wood creaking",
      "musicTheme": "Preghiera dei Pescatori"
    },
    
    "seasonalEffects": {
      "winter": "Smoke from chimney more visible, frost on roof",
      "carnival": "Simple decorations, small colored flags"
    },
    
    "aiInteractionPoints": ["Front door", "Dock", "Side yard for net repairs"]
  },
  
  {
    "name": "Artisan's House",
    "category": "Residential",
    "subcategory": "Basic Residences",
    "tier": 1,
    "size": "Medium",
    "unlockCondition": "5 citizens, 1,000 ducats total wealth",
    
    "shortDescription": "Modest residence with attached workshop space for craftspeople.",
    "fullDescription": "A practical combined living and working space for Venice's skilled artisans. The ground floor typically houses a workshop open to the street, while upper floors provide living quarters for the artisan's family. These buildings form the backbone of Venice's craft economy.",
    "flavorText": "The hands shape the clay, the wood, the glass—and in turn, they shape Venice itself.",
    
    "constructionCosts": {
      "ducats": 1500,
      "timber": 60,
      "bricks": 80,
      "stone": 30
    },
    "maintenanceCost": 8,
    "constructionTime": 259200000,
    "incomeGeneration": 18,
    "residentsCapacity": 5,
    
    "locationRequirements": {
      "districtRestrictions": "Cannot be built in San Marco",
      "adjacentRequirements": "Must be adjacent to street or small plaza",
      "environmentalEffects": "Small increase in property value for nearby Basic Residences"
    },
    
    "constructionPhase3DPrompt": "Renaissance Venetian artisan's house under construction, two-story structure, brick and timber frame, ground floor workshop area taking shape with large front opening, separate residential upper floor, wooden scaffolding, workers installing roof tiles, window frames being fitted, tools and construction materials organized neatly, period-appropriate construction techniques, partial plaster covering on some walls, isometric game perspective, stylized but detailed, warm brick and timber textures",
    
    "completedBuilding3DPrompt": "Completed Renaissance Venetian artisan's house, two-story structure with workshop on ground floor, large front opening with wooden shutters that open to street, residential upper floor with small balcony, plastered exterior in warm Venetian red with exposed timber framing, terracotta roof tiles, workshop signage hanging from decorative iron bracket, small side courtyard, historically accurate but slightly stylized for game aesthetic, isometric game perspective, detailed craft-specific elements visible in workshop, well-worn entrance threshold, chimney with thin smoke",
    
    "gameplayInformation": {
      "unlocks": ["Basic Craft Workshop operations"],
      "specialAbilities": ["Can house artisan family", "Provides space for small craft business"],
      "upgradePath": ["Merchant's House"],
      "reputationEffects": {
        "Artisan's Guild": 8,
        "Merchant Guild": 3
      },
      "riskFactors": {
        "fireRisk": "Medium-High (workshop materials)",
        "floodRisk": "Medium",
        "crimeRisk": "Low"
      }
    },
    
    "soundDesign": {
      "ambientSound": "Tool working sounds, street chatter",
      "activitySounds": "Hammering, sawing, customer interactions",
      "musicTheme": "Rialto Mercante"
    },
    
    "seasonalEffects": {
      "winter": "Workshop more enclosed, brazier visible",
      "carnival": "Workshop busy with mask or costume production"
    },
    
    "aiInteractionPoints": ["Workshop entrance", "Upper floor windows", "Side courtyard"]
  },
  
  {
    "name": "Merchant's House",
    "category": "Residential",
    "subcategory": "Basic Residences",
    "tier": 2,
    "size": "Medium",
    "unlockCondition": "5,000 ducats total wealth, Merchant Guild connection",
    
    "shortDescription": "Comfortable residence with dedicated office space for business dealings.",
    "fullDescription": "A respectable home for Venice's merchant class, featuring separate areas for business and family life. Typically includes a ground floor counting room or office, a piano nobile (noble floor) for family living, and often additional floors for storage or servants. Represents success in Venice's trading world.",
    "flavorText": "Ledgers below, living above—the merchant's house is a perfect balance of commerce and comfort, just as the merchant balances risk and reward.",
    
    "constructionCosts": {
      "ducats": 3200,
      "timber": 80,
      "bricks": 150,
      "stone": 100,
      "glass": 15
    },
    "maintenanceCost": 15,
    "constructionTime": 345600000,
    "incomeGeneration": 28,
    "residentsCapacity": 7
  }
];

// Map of building categories to their data
const buildingData: Record<string, any> = {
  'residential': residentialBuildings,
  // We'll add more categories as they become available
  // For now, we'll return the residential data for all categories as a fallback
};

export async function GET(
  request: Request,
  { params }: { params: { category: string } }
) {
  try {
    const { category } = params;
    
    // Check if we have data for this category
    if (buildingData[category]) {
      return NextResponse.json(buildingData[category]);
    }
    
    // If not, return residential data as a fallback
    return NextResponse.json(buildingData['residential']);
  } catch (error) {
    console.error(`Error fetching building data for category ${params.category}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch building data' },
      { status: 500 }
    );
  }
}
