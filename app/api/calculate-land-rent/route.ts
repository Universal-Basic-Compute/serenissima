import { NextResponse } from 'next/server';
import { serverUtils, calculateCentroid } from '@/lib/fileUtils';

// Venice center coordinates
const VENICE_CENTER = {
  lat: 45.438324,
  lng: 12.331768
};

// Maximum distance factor (in km) - beyond this distance, the multiplier is 1x
const MAX_DISTANCE = 2.5; // ~2.5km covers most of Venice

// Market stall reference values from the game economy
const MARKET_STALL_CONSTRUCTION_COST = 150000; // ducats
const MARKET_STALL_DAILY_INCOME = 8000; // ducats
const MARKET_STALL_SIZE = 20; // approximate size in square meters

// Calculate distance between two coordinates in kilometers using Haversine formula
function calculateDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate location multiplier based on distance from center
function calculateLocationMultiplier(distance) {
  // Linear scaling from 5x at center to 1x at MAX_DISTANCE or beyond
  const multiplier = 5 - (4 * Math.min(distance, MAX_DISTANCE) / MAX_DISTANCE);
  return Math.max(1, multiplier);
}

// Calculate base rent based on area
function calculateBaseRent(areaInSquareMeters) {
  // Use market stall as reference: 8000 ducats daily income for ~20 sq meters
  // This gives us ~400 ducats per sq meter as a baseline
  const baseRatePerSquareMeter = MARKET_STALL_DAILY_INCOME / MARKET_STALL_SIZE;
  
  // Apply a slight diminishing return for larger areas
  const scaleFactor = Math.pow(areaInSquareMeters / MARKET_STALL_SIZE, 0.85);
  
  return baseRatePerSquareMeter * areaInSquareMeters * scaleFactor;
}

export async function GET() {
  try {
    // Read all polygon files
    const files = serverUtils.getAllJsonFiles();
    const landRents = [];
    
    // Process each polygon
    for (const file of files) {
      const data = serverUtils.readJsonFromFile(file);
      const id = file.replace('.json', '');
      
      // Skip invalid data
      if (!data || (!data.coordinates && !Array.isArray(data))) {
        continue;
      }
      
      // Extract coordinates and area
      const coordinates = data.coordinates || data;
      const areaInSquareMeters = data.areaInSquareMeters || 0;
      
      // If no area is stored, skip this polygon
      if (!areaInSquareMeters) {
        continue;
      }
      
      // Get centroid
      const centroid = data.centroid || calculateCentroid(coordinates);
      
      // Calculate distance from Venice center
      const distanceFromCenter = calculateDistance(centroid, VENICE_CENTER);
      
      // Calculate location multiplier (1x to 5x)
      const locationMultiplier = calculateLocationMultiplier(distanceFromCenter);
      
      // Calculate base rent from area
      const baseRent = calculateBaseRent(areaInSquareMeters);
      
      // Apply location multiplier
      const dailyRent = Math.round(baseRent * locationMultiplier);
      
      // Add some randomness (±10%) to make it more natural
      const randomFactor = 0.9 + (Math.random() * 0.2);
      const finalRent = Math.round(dailyRent * randomFactor);
      
      landRents.push({
        id,
        centroid,
        areaInSquareMeters,
        distanceFromCenter,
        locationMultiplier: parseFloat(locationMultiplier.toFixed(2)),
        dailyRent: finalRent,
        historicalName: data.historicalName || null
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      landRents,
      metadata: {
        totalLands: landRents.length,
        averageRent: Math.round(landRents.reduce((sum, land) => sum + land.dailyRent, 0) / landRents.length),
        minRent: Math.min(...landRents.map(land => land.dailyRent)),
        maxRent: Math.max(...landRents.map(land => land.dailyRent))
      }
    });
  } catch (error) {
    console.error('Error calculating land rents:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate land rents' },
      { status: 500 }
    );
  }
}
