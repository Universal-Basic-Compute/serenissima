#!/usr/bin/env node

/**
 * Bootstrap Human Citizen Positions
 * 
 * This script updates positions of human citizens (IsAI=false) to random unoccupied building points.
 * It fetches building points from the API and assigns citizens to unoccupied points.
 */

require('dotenv').config();
const Airtable = require('airtable');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Constants
const CITIZENS_TABLE = 'CITIZENS';
const BUILDINGS_TABLE = 'BUILDINGS';
const API_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function main() {
  try {
    console.log('Starting human citizen position bootstrap process...');
    
    // Step 1: Fetch all building points from the API
    console.log('Fetching building points from API...');
    const polygonsResponse = await fetch(`${API_URL}/api/get-polygons`);
    
    if (!polygonsResponse.ok) {
      throw new Error(`Failed to fetch polygons: ${polygonsResponse.status} ${polygonsResponse.statusText}`);
    }
    
    const polygonsData = await polygonsResponse.json();
    
    if (!polygonsData.polygons || !Array.isArray(polygonsData.polygons)) {
      throw new Error('Invalid polygons data structure');
    }
    
    // Extract all building points from polygons
    const allBuildingPoints = [];
    polygonsData.polygons.forEach(polygon => {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        polygon.buildingPoints.forEach(point => {
          if (point && typeof point === 'object' && 'lat' in point && 'lng' in point) {
            allBuildingPoints.push({
              lat: point.lat,
              lng: point.lng,
              landId: polygon.id
            });
          }
        });
      }
    });
    
    console.log(`Found ${allBuildingPoints.length} total building points`);
    
    // Step 2: Fetch all buildings to identify occupied points
    console.log('Fetching buildings to identify occupied points...');
    const buildingsResponse = await fetch(`${API_URL}/api/buildings`);
    
    if (!buildingsResponse.ok) {
      throw new Error(`Failed to fetch buildings: ${buildingsResponse.status} ${buildingsResponse.statusText}`);
    }
    
    const buildingsData = await buildingsResponse.json();
    
    if (!buildingsData.buildings || !Array.isArray(buildingsData.buildings)) {
      throw new Error('Invalid buildings data structure');
    }
    
    // Identify occupied building points
    const occupiedPoints = new Set();
    buildingsData.buildings.forEach(building => {
      if (building.position) {
        let position;
        
        if (typeof building.position === 'string') {
          try {
            position = JSON.parse(building.position);
          } catch (e) {
            console.warn(`Invalid position string for building ${building.id}:`, building.position);
            return;
          }
        } else {
          position = building.position;
        }
        
        if (position && typeof position === 'object' && 'lat' in position && 'lng' in position) {
          // Use a string key for the Set with some precision to avoid floating point comparison issues
          const key = `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
          occupiedPoints.add(key);
        }
      }
    });
    
    console.log(`Found ${occupiedPoints.size} occupied building points`);
    
    // Step 3: Determine available building points
    const availableBuildingPoints = allBuildingPoints.filter(point => {
      const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
      return !occupiedPoints.has(key);
    });
    
    console.log(`Found ${availableBuildingPoints.length} available building points`);
    
    if (availableBuildingPoints.length === 0) {
      throw new Error('No available building points found');
    }
    
    // Step 4: Fetch human citizens (IsAI=false)
    console.log('Fetching human citizens from Airtable...');
    const humanCitizens = await new Promise((resolve, reject) => {
      const citizens = [];
      base(CITIZENS_TABLE)
        .select({
          filterByFormula: '{IsAI} = FALSE()',
          fields: ['CitizenId', 'FirstName', 'LastName', 'Position']
        })
        .eachPage(
          function page(records, fetchNextPage) {
            records.forEach(record => {
              citizens.push({
                id: record.id,
                citizenId: record.get('CitizenId'),
                firstName: record.get('FirstName'),
                lastName: record.get('LastName'),
                currentPosition: record.get('Position')
              });
            });
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(citizens);
          }
        );
    });
    
    console.log(`Found ${humanCitizens.length} human citizens`);
    
    // Step 5: Assign random available building points to human citizens
    console.log('Assigning random building points to human citizens...');
    
    // Shuffle available points to randomize assignments
    const shuffledPoints = [...availableBuildingPoints].sort(() => Math.random() - 0.5);
    
    // Ensure we have enough points
    if (shuffledPoints.length < humanCitizens.length) {
      console.warn(`Warning: Not enough available points (${shuffledPoints.length}) for all human citizens (${humanCitizens.length})`);
    }
    
    // Create a map of citizen updates
    const citizenUpdates = [];
    
    for (let i = 0; i < humanCitizens.length; i++) {
      const citizen = humanCitizens[i];
      // Use modulo to wrap around if we have more citizens than points
      const point = shuffledPoints[i % shuffledPoints.length];
      
      // Create position JSON string
      const positionJson = JSON.stringify({
        lat: point.lat,
        lng: point.lng
      });
      
      citizenUpdates.push({
        id: citizen.id,
        fields: {
          Position: positionJson,
          // Also set InVenice to true since they're now at a building point
          InVenice: true
        }
      });
      
      console.log(`Assigned citizen ${citizen.firstName} ${citizen.lastName} (${citizen.citizenId}) to position ${positionJson}`);
    }
    
    // Step 6: Update citizens in Airtable
    console.log('Updating citizen positions in Airtable...');
    
    // Process updates in batches of 10 (Airtable limit)
    const BATCH_SIZE = 10;
    for (let i = 0; i < citizenUpdates.length; i += BATCH_SIZE) {
      const batch = citizenUpdates.slice(i, i + BATCH_SIZE);
      await base(CITIZENS_TABLE).update(batch);
      console.log(`Updated batch ${i/BATCH_SIZE + 1} of ${Math.ceil(citizenUpdates.length/BATCH_SIZE)}`);
    }
    
    console.log(`Successfully updated positions for ${citizenUpdates.length} human citizens`);
    
    // Step 7: Save a log of the updates
    const logData = {
      timestamp: new Date().toISOString(),
      totalBuildingPoints: allBuildingPoints.length,
      occupiedPoints: occupiedPoints.size,
      availablePoints: availableBuildingPoints.length,
      humanCitizens: humanCitizens.length,
      updatedCitizens: citizenUpdates.length,
      updates: citizenUpdates.map(update => ({
        citizenId: humanCitizens.find(c => c.id === update.id)?.citizenId,
        name: `${humanCitizens.find(c => c.id === update.id)?.firstName} ${humanCitizens.find(c => c.id === update.id)?.lastName}`,
        position: JSON.parse(update.fields.Position)
      }))
    };
    
    await fs.writeFile(
      path.join(__dirname, '..', 'logs', `human-citizen-positions-${Date.now()}.json`),
      JSON.stringify(logData, null, 2)
    );
    
    console.log('Process completed successfully!');
    
  } catch (error) {
    console.error('Error bootstrapping human citizen positions:', error);
    process.exit(1);
  }
}

// Run the script
main();
