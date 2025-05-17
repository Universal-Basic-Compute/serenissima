#!/usr/bin/env node

/**
 * Bootstrap Citizen Positions
 * 
 * This script assigns random polygon center positions to citizens who don't already have positions.
 * It ensures no two citizens are assigned to the same position.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Error: AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables must be set');
  process.exit(1);
}

// Function to fetch all citizens from Airtable
async function fetchCitizens(axios) {
  try {
    console.log('Fetching citizens from Airtable...');
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/CITIZENS`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.records) {
      console.log(`Successfully fetched ${response.data.records.length} citizens`);
      return response.data.records;
    } else {
      console.error('Error: Unexpected response format from Airtable');
      return [];
    }
  } catch (error) {
    console.error('Error fetching citizens from Airtable:', error.message);
    return [];
  }
}

// Function to fetch polygon data from the API
async function fetchPolygons(axios) {
  try {
    console.log('Fetching polygons from API...');
    
    const response = await axios.get('http://localhost:3000/api/get-polygons');
    
    if (response.data && response.data.polygons) {
      console.log(`Successfully fetched ${response.data.polygons.length} polygons`);
      return response.data.polygons;
    } else {
      console.error('Error: Unexpected response format from API');
      return [];
    }
  } catch (error) {
    console.error('Error fetching polygons from API:', error.message);
    return [];
  }
}

// Function to extract polygon centers
function extractPolygonCenters(polygons) {
  const centers = [];
  
  for (const polygon of polygons) {
    if (polygon.center) {
      centers.push(polygon.center);
    } else if (polygon.centroid) {
      centers.push(polygon.centroid);
    }
  }
  
  console.log(`Extracted ${centers.length} polygon centers`);
  return centers;
}

// Function to update a citizen's position in Airtable
async function updateCitizenPosition(citizenId, position) {
  try {
    // Dynamically import axios for this function
    const { default: axios } = await import('axios');
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/CITIZENS/${citizenId}`;
    
    await axios.patch(url, {
      fields: {
        Position: JSON.stringify(position)
      }
    }, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return true;
  } catch (error) {
    console.error(`Error updating position for citizen ${citizenId}:`, error.message);
    return false;
  }
}

// Main function
async function bootstrapCitizenPositions() {
  try {
    // Dynamically import axios
    const { default: axios } = await import('axios');
    
    // Fetch citizens and polygons
    const citizens = await fetchCitizens(axios);
    const polygons = await fetchPolygons(axios);
    
    if (citizens.length === 0 || polygons.length === 0) {
      console.error('Error: Could not fetch citizens or polygons');
      return;
    }
    
    // Extract polygon centers
    const polygonCenters = extractPolygonCenters(polygons);
    
    if (polygonCenters.length === 0) {
      console.error('Error: No polygon centers found');
      return;
    }
    
    // Create a copy of polygon centers that we can modify
    const availableCenters = [...polygonCenters];
    
    // Track citizens that need positions
    const citizensNeedingPositions = citizens.filter(citizen => !citizen.fields.Position);
    console.log(`Found ${citizensNeedingPositions.length} citizens without positions`);
    
    // Track citizens with existing positions to avoid duplicates
    const usedPositions = new Set();
    citizens.forEach(citizen => {
      if (citizen.fields.Position) {
        try {
          const position = JSON.parse(citizen.fields.Position);
          // Create a key from the position to track used positions
          const posKey = `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
          usedPositions.add(posKey);
        } catch (e) {
          console.warn(`Citizen ${citizen.id} has invalid position: ${citizen.fields.Position}`);
        }
      }
    });
    
    console.log(`Found ${usedPositions.size} positions already in use`);
    
    // Filter out centers that are already used
    let filteredCenters = availableCenters.filter(center => {
      const posKey = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
      return !usedPositions.has(posKey);
    });
    
    console.log(`${filteredCenters.length} polygon centers available after filtering out used positions`);
    
    // If we don't have enough centers, we'll have to reuse some
    if (filteredCenters.length < citizensNeedingPositions.length) {
      console.warn(`Warning: Not enough unique polygon centers (${filteredCenters.length}) for all citizens (${citizensNeedingPositions.length})`);
      console.warn('Some citizens will share positions');
      
      // Add more centers by duplicating existing ones
      while (filteredCenters.length < citizensNeedingPositions.length) {
        // Add a small random offset to create a new position
        const baseCenter = polygonCenters[Math.floor(Math.random() * polygonCenters.length)];
        const newCenter = {
          lat: baseCenter.lat + (Math.random() * 0.0002 - 0.0001),
          lng: baseCenter.lng + (Math.random() * 0.0002 - 0.0001)
        };
        filteredCenters.push(newCenter);
      }
    }
    
    // Shuffle the centers to randomize assignments
    filteredCenters = filteredCenters.sort(() => Math.random() - 0.5);
    
    // Assign positions to citizens
    let updatedCount = 0;
    for (let i = 0; i < citizensNeedingPositions.length; i++) {
      const citizen = citizensNeedingPositions[i];
      
      // Get a random center
      const position = filteredCenters[i % filteredCenters.length];
      
      console.log(`Assigning position ${JSON.stringify(position)} to citizen ${citizen.fields.FirstName} ${citizen.fields.LastName}`);
      
      // Update the citizen's position in Airtable
      const success = await updateCitizenPosition(citizen.id, position);
      
      if (success) {
        updatedCount++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Successfully updated positions for ${updatedCount} citizens`);
  } catch (error) {
    console.error('Error bootstrapping citizen positions:', error);
  }
}

// Run the script
bootstrapCitizenPositions().then(() => {
  console.log('Citizen position bootstrap complete');
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
