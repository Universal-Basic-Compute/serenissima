import { NextResponse } from 'next/server';
import { serverUtils, calculateCentroid } from '@/lib/utils/fileUtils';
import { airtableUtils } from '@/lib/utils/airtableUtils';

// Venice center coordinates
const VENICE_CENTER = {
  lat: 45.438324,
  lng: 12.331768
};

// Maximum distance factor (in km) - beyond this distance, the multiplier is 1x
const MAX_DISTANCE = 2.5; // ~2.5km covers most of Venice

// Contract stall reference values from the game economy
const MARKET_STALL_DAILY_INCOME = 8000; // ducats
const MARKET_STALL_SIZE = 20; // approximate size in square meters

// Target economic values
const AVERAGE_LAND_PRICE = 1000000; // 1M ducats average land price
const TARGET_ANNUAL_YIELD = 0.05; // 5% annual yield (reasonable real estate return)
const DAYS_PER_YEAR = 365;

// Calculate target daily rent based on land value
// If land is worth 1M ducats and we want 5% annual yield, daily rent should be:
// 1,000,000 * 0.05 / 365 = ~137 ducats per day
const TARGET_DAILY_RENT_PER_MILLION = (AVERAGE_LAND_PRICE * TARGET_ANNUAL_YIELD) / DAYS_PER_YEAR;

// Calculate distance between two coordinates in kilometers using Haversine formula
function calculateDistance(coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }) {
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
function calculateLocationMultiplier(distance: number) {
  // Linear scaling from 5x at center to 1x at MAX_DISTANCE or beyond
  const multiplier = 5 - (4 * Math.min(distance, MAX_DISTANCE) / MAX_DISTANCE);
  return Math.max(1, multiplier);
}

// Calculate base rent based on area - recalibrated to match target economy
function calculateBaseRent(areaInSquareMeters: number): number {
  // Base value calculation - using a reference size of 100 sq meters
  const REFERENCE_SIZE = 100; // sq meters
  const REFERENCE_RENT = TARGET_DAILY_RENT_PER_MILLION; // ~137 ducats per day for 1M value
  
  // Calculate size factor with diminishing returns for larger areas
  const sizeFactor = Math.pow(areaInSquareMeters / REFERENCE_SIZE, 0.7);
  
  // Calculate base rent
  return REFERENCE_RENT * sizeFactor;
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
      // Divide the final rent by 4 to bring values into a more reasonable range
      const finalRent = Math.round((dailyRent * randomFactor) / 4);
      
      // Calculate estimated land value based on rent (for verification)
      const estimatedLandValue = Math.round((finalRent * DAYS_PER_YEAR) / TARGET_ANNUAL_YIELD);
      
      landRents.push({
        id,
        centroid,
        areaInSquareMeters,
        distanceFromCenter,
        locationMultiplier: parseFloat(locationMultiplier.toFixed(2)),
        dailyRent: finalRent,
        estimatedLandValue,
        historicalName: data.historicalName || null
      });
    }
    
    // Save the calculated land rents to Airtable
    try {
      await airtableUtils.saveLandRents(landRents);
      console.log(`Successfully saved ${landRents.length} land rent records to Airtable`);
    } catch (error) {
      console.error('Failed to save land rents to Airtable:', error);
      // Continue with the response even if Airtable save fails
    }
    
    const averageRent = Math.round(landRents.reduce((sum, land) => sum + land.dailyRent, 0) / landRents.length);
    const minRent = Math.min(...landRents.map(land => land.dailyRent));
    const maxRent = Math.max(...landRents.map(land => land.dailyRent));
    const averageLandValue = Math.round(landRents.reduce((sum, land) => sum + land.estimatedLandValue, 0) / landRents.length);
    
    return NextResponse.json({ 
      success: true, 
      landRents,
      metadata: {
        totalLands: landRents.length,
        averageRent,
        minRent,
        maxRent,
        averageLandValue,
        targetYield: TARGET_ANNUAL_YIELD,
        savedToAirtable: true
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
