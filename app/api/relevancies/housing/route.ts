import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { saveRelevancies } from '@/lib/utils/relevancyUtils';

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = process.env.AIRTABLE_CITIZENS_TABLE || 'CITIZENS';
const AIRTABLE_BUILDINGS_TABLE = process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS';

export async function GET(request: NextRequest) {
  try {
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Fetch citizens who are in Venice
    const citizensResponse = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{InVenice} = TRUE()',
        fields: ['Username', 'FirstName', 'LastName', 'SocialClass'] // Removed 'id'
      })
      .all();
    
    // Fetch all buildings with category "home"
    const homeBuildingsResponse = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: '{Category} = "home"',
        fields: ['BuildingId', 'Type', 'Occupant', 'Owner']
      })
      .all();
    
    // Count citizens who are homeless (not in Occupant field of any home building)
    const occupiedHomes = homeBuildingsResponse
      .filter(building => building.get('Occupant'))
      .map(building => building.get('Occupant') as string);

    // Filter citizens to exclude 'Forestieri' for housing statistics
    const relevantCitizensForHousingStats = citizensResponse.filter(citizen => {
      const socialClass = citizen.get('SocialClass') as string || 'Unknown';
      return socialClass.toLowerCase() !== 'forestieri';
    });
    
    const homelessCitizens = relevantCitizensForHousingStats
      .filter(citizen => {
        const username = citizen.get('Username') as string;
        return username && !occupiedHomes.includes(username);
      });
    
    // Count vacant homes (home buildings with no Occupant)
    const vacantHomes = homeBuildingsResponse
      .filter(building => {
        const occupant = building.get('Occupant');
        // Consider a home vacant only if Occupant field is empty, null, or undefined
        return occupant === null || occupant === undefined || occupant === '' || 
               (typeof occupant === 'string' && occupant.trim() === '');
      });
    
    console.log(`Found ${homeBuildingsResponse.length} total homes`);
    console.log(`Found ${vacantHomes.length} vacant homes`);
    
    // Add detailed logging to help diagnose occupancy issues
    console.log(`Detailed home occupancy analysis:`);
    homeBuildingsResponse.forEach(building => {
      const buildingId = building.get('BuildingId');
      const occupant = building.get('Occupant');
      const occupantType = typeof occupant;
      console.log(`Building ${buildingId}: Occupant=${occupant}, Type=${occupantType}, IsEmpty=${!occupant || occupant === ''}`);
    });
    console.log(`Found ${homelessCitizens.length} homeless citizens out of ${relevantCitizensForHousingStats.length} relevant citizens (excluding Forestieri). Total citizens fetched: ${citizensResponse.length}.`);
    
    // Calculate housing statistics based on relevant citizens
    const totalCitizens = relevantCitizensForHousingStats.length; // Use filtered list for total
    const totalHomes = homeBuildingsResponse.length;
    const homelessCount = homelessCitizens.length;
    const vacantCount = vacantHomes.length;
    
    // Calculate homelessness rate and vacancy rate
    const homelessRate = totalCitizens > 0 ? (homelessCount / totalCitizens) * 100 : 0;
    const vacancyRate = totalHomes > 0 ? (vacantCount / totalHomes) * 100 : 0;
    
    // Calculate housing relevancy score
    // Higher score means more housing issues (more homelessness, fewer vacancies)
    // Score ranges from 0-100
    let relevancyScore = 0;
    
    if (vacantCount === 0 && homelessCount > 0) {
      // Critical housing shortage: no vacant homes but homeless citizens exist
      relevancyScore = 100;
    } else if (vacantCount > 0 && homelessCount > 0) {
      // Housing mismatch: both vacant homes and homeless citizens exist
      // Score based on ratio of homeless to vacant (higher ratio = higher score)
      const ratio = homelessCount / vacantCount;
      relevancyScore = Math.min(90, Math.max(50, ratio * 30));
    } else if (vacantCount > 0 && homelessCount === 0) {
      // Housing surplus: vacant homes but no homeless citizens
      // Score based on vacancy rate (higher vacancy = lower score)
      relevancyScore = Math.max(10, 50 - (vacancyRate * 0.5));
    } else {
      // Perfect balance: no homeless citizens and no vacant homes
      relevancyScore = 30; // Moderate score for monitoring
    }
    
    // Round to 2 decimal places
    relevancyScore = Math.round(relevancyScore * 100) / 100;
    
    // Determine status based on score
    let status = 'low';
    if (relevancyScore > 70) status = 'high';
    else if (relevancyScore > 40) status = 'medium';
    
    // Determine time horizon based on score
    let timeHorizon = 'long';
    if (relevancyScore > 70) timeHorizon = 'short';
    else if (relevancyScore > 40) timeHorizon = 'medium';
    
    // Create relevancy object
    const housingRelevancy = {
      score: relevancyScore,
      asset: 'venice_housing',
      assetType: 'city',
      category: 'housing',
      type: 'housing_situation',
      targetCitizen: 'ConsiglioDeiDieci',
      relevantToCitizen: 'all',
      title: `Housing Situation in Venice`,
      description: `
### Venice Housing Report

**Current Statistics:**
- **Homeless Citizens:** ${homelessCount} (${homelessRate.toFixed(1)}% of population)
- **Vacant Homes:** ${vacantCount} (${vacancyRate.toFixed(1)}% vacancy rate)
- **Total Citizens:** ${totalCitizens}
- **Total Homes:** ${totalHomes}

**Homelessness by Social Class:**
${Object.entries((() => {
  const details: Record<string, { total: number; homeless: number }> = {};
  const citizensForHomelessness = citizensResponse.filter(
    cr => (cr.get('SocialClass') as string || 'Unknown').toLowerCase() !== 'forestieri'
  );
  citizensForHomelessness.forEach(citizenRecord => {
    const socialClass = citizenRecord.get('SocialClass') as string || 'Unknown';
    if (!details[socialClass]) {
      details[socialClass] = { total: 0, homeless: 0 };
    }
    details[socialClass].total++;
    const username = citizenRecord.get('Username') as string;
    if (username && !occupiedHomes.includes(username)) {
      details[socialClass].homeless++;
    }
  });
  return details;
})()).map(([socialClass, stats]) => `- ${socialClass}: ${stats.homeless} / ${stats.total} homeless`).join('\n')}

${getHousingRecommendation(homelessCount, vacantCount, relevancyScore)}
      `.trim(),
      timeHorizon,
      status
    };
    
    return NextResponse.json({
      success: true,
      housingRelevancy,
      statistics: {
        homelessCount,
        vacantCount,
        totalCitizens,
        totalHomes,
        homelessRate: homelessRate.toFixed(1),
        vacancyRate: vacancyRate.toFixed(1),
        homelessnessBySocialClass: (() => {
          const details: Record<string, { total: number; homeless: number }> = {};
          citizensResponse.forEach(citizenRecord => {
            const socialClass = citizenRecord.get('SocialClass') as string || 'Unknown';
            if (!details[socialClass]) {
              details[socialClass] = { total: 0, homeless: 0 };
            }
            details[socialClass].total++;
            const username = citizenRecord.get('Username') as string;
            if (username && !occupiedHomes.includes(username)) {
              details[socialClass].homeless++;
            }
          });
          return details;
        })()
      }
    });
    
  } catch (error) {
    console.error('Error calculating housing relevancy:', error);
    return NextResponse.json(
      { error: 'Failed to calculate housing relevancy', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the username from the request body (optional, for consistency if ever used)
    const body = await request.json();
    const { Citizen } = body; // Changed from aiUsername
    
    // Initialize Airtable
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Airtable credentials not configured' },
        { status: 500 }
      );
    }
    
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Fetch citizens who are in Venice
    const citizensResponse = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        filterByFormula: '{InVenice} = TRUE()',
        fields: ['Username', 'FirstName', 'LastName', 'SocialClass'] // Removed 'id'
      })
      .all();
    
    // Fetch all buildings with category "home"
    const homeBuildingsResponse = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: '{Category} = "home"',
        fields: ['BuildingId', 'Type', 'Occupant', 'Owner']
      })
      .all();
    
    // Count citizens who are homeless (not in Occupant field of any home building)
    const occupiedHomes = homeBuildingsResponse
      .filter(building => building.get('Occupant'))
      .map(building => building.get('Occupant') as string);

    // Filter citizens to exclude 'Forestieri' for housing statistics
    const relevantCitizensForHousingStats = citizensResponse.filter(citizen => {
      const socialClass = citizen.get('SocialClass') as string || 'Unknown';
      return socialClass.toLowerCase() !== 'forestieri';
    });
    
    const homelessCitizens = relevantCitizensForHousingStats
      .filter(citizen => {
        const username = citizen.get('Username') as string;
        return username && !occupiedHomes.includes(username);
      });
    
    // Count vacant homes (home buildings with no Occupant)
    const vacantHomes = homeBuildingsResponse
      .filter(building => {
        const occupant = building.get('Occupant');
        // Consider a home vacant only if Occupant field is empty, null, or undefined
        return occupant === null || occupant === undefined || occupant === '' || 
               (typeof occupant === 'string' && occupant.trim() === '');
      });
    
    console.log(`Found ${homeBuildingsResponse.length} total homes`);
    console.log(`Found ${vacantHomes.length} vacant homes`);
    
    // Add detailed logging to help diagnose occupancy issues
    console.log(`Detailed home occupancy analysis:`);
    homeBuildingsResponse.forEach(building => {
      const buildingId = building.get('BuildingId');
      const occupant = building.get('Occupant');
      const occupantType = typeof occupant;
      console.log(`Building ${buildingId}: Occupant=${occupant}, Type=${occupantType}, IsEmpty=${!occupant || occupant === ''}`);
    });
    console.log(`Found ${homelessCitizens.length} homeless citizens out of ${relevantCitizensForHousingStats.length} relevant citizens (excluding Forestieri). Total citizens fetched: ${citizensResponse.length}.`);
    
    // Calculate housing statistics based on relevant citizens
    const totalCitizens = relevantCitizensForHousingStats.length; // Use filtered list for total
    const totalHomes = homeBuildingsResponse.length;
    const homelessCount = homelessCitizens.length;
    const vacantCount = vacantHomes.length;
    
    // Calculate homelessness rate and vacancy rate
    const homelessRate = totalCitizens > 0 ? (homelessCount / totalCitizens) * 100 : 0;
    const vacancyRate = totalHomes > 0 ? (vacantCount / totalHomes) * 100 : 0;
    
    // Calculate housing relevancy score
    // Higher score means more housing issues (more homelessness, fewer vacancies)
    let relevancyScore = 0;
    
    if (vacantCount === 0 && homelessCount > 0) {
      // Critical housing shortage: no vacant homes but homeless citizens exist
      relevancyScore = 100;
    } else if (vacantCount > 0 && homelessCount > 0) {
      // Housing mismatch: both vacant homes and homeless citizens exist
      // Score based on ratio of homeless to vacant (higher ratio = higher score)
      const ratio = homelessCount / vacantCount;
      relevancyScore = Math.min(90, Math.max(50, ratio * 30));
    } else if (vacantCount > 0 && homelessCount === 0) {
      // Housing surplus: vacant homes but no homeless citizens
      // Score based on vacancy rate (higher vacancy = lower score)
      relevancyScore = Math.max(10, 50 - (vacancyRate * 0.5));
    } else {
      // Perfect balance: no homeless citizens and no vacant homes
      relevancyScore = 30; // Moderate score for monitoring
    }
    
    // Round to 2 decimal places
    relevancyScore = Math.round(relevancyScore * 100) / 100;
    
    // Determine status based on score
    let status = 'low';
    if (relevancyScore > 70) status = 'high';
    else if (relevancyScore > 40) status = 'medium';
    
    // Determine time horizon based on score
    let timeHorizon = 'long';
    if (relevancyScore > 70) timeHorizon = 'short';
    else if (relevancyScore > 40) timeHorizon = 'medium';
    
    // Create relevancy object
    const housingRelevancy = {
      score: relevancyScore,
      asset: 'venice_housing',
      assetType: 'city',
      category: 'housing',
      type: 'housing_situation',
      targetCitizen: 'ConsiglioDeiDieci',
      relevantToCitizen: 'all',
      title: `Housing Situation in Venice`,
      description: `
### Venice Housing Report

**Current Statistics:**
- **Homeless Citizens:** ${homelessCount} (${homelessRate.toFixed(1)}% of population)
- **Vacant Homes:** ${vacantCount} (${vacancyRate.toFixed(1)}% vacancy rate)
- **Total Citizens:** ${totalCitizens}
- **Total Homes:** ${totalHomes}

**Homelessness by Social Class:**
${Object.entries((() => {
  const details: Record<string, { total: number; homeless: number }> = {};
  const citizensForHomelessness = citizensResponse.filter(
    cr => (cr.get('SocialClass') as string || 'Unknown').toLowerCase() !== 'forestieri'
  );
  citizensForHomelessness.forEach(citizenRecord => {
    const socialClass = citizenRecord.get('SocialClass') as string || 'Unknown';
    if (!details[socialClass]) {
      details[socialClass] = { total: 0, homeless: 0 };
    }
    details[socialClass].total++;
    const username = citizenRecord.get('Username') as string;
    if (username && !occupiedHomes.includes(username)) {
      details[socialClass].homeless++;
    }
  });
  return details;
})()).map(([socialClass, stats]) => `- ${socialClass}: ${stats.homeless} / ${stats.total} homeless`).join('\n')}

${getHousingRecommendation(homelessCount, vacantCount, relevancyScore)}
      `.trim(),
      timeHorizon,
      status
    };
    
    // Create a map of relevancies to save
    const relevancies: Record<string, any> = {
      'venice_housing': housingRelevancy
    };
    
    // Save to Airtable as a global relevancy
    let saved = false;
    try {
      // Create a modified housing relevancy with targetCitizen and relevantToCitizen set to 'all'
      const globalHousingRelevancy = {
        ...housingRelevancy,
        targetCitizen: 'all',
        relevantToCitizen: 'all'
      };
      
      // Initialize Airtable directly to bypass the deletion logic in saveRelevancies
      const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
      const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';
      
      // Create a unique ID for this relevancy
      const relevancyId = `global_housing_${Date.now()}`;
      
      // Create the relevancy record directly
      await base(AIRTABLE_RELEVANCIES_TABLE).create({
        RelevancyId: relevancyId,
        Asset: 'venice_housing',
        AssetType: 'city',
        Category: 'housing',
        Type: 'housing_situation',
        TargetCitizen: 'ConsiglioDeiDieci',
        RelevantToCitizen: 'all',
        Score: globalHousingRelevancy.score,
        TimeHorizon: globalHousingRelevancy.timeHorizon,
        Title: globalHousingRelevancy.title,
        Description: globalHousingRelevancy.description,
        Status: globalHousingRelevancy.status,
        CreatedAt: new Date().toISOString()
      });
      
      console.log('Successfully saved global housing relevancy directly to Airtable');
      saved = true;
    } catch (error) {
      console.error('Error saving housing relevancy to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      housingRelevancy,
      statistics: {
        homelessCount,
        vacantCount,
        totalCitizens,
        totalHomes,
        homelessRate: homelessRate.toFixed(1),
        vacancyRate: vacancyRate.toFixed(1),
        homelessnessBySocialClass: (() => { // Calculate and add homelessness by social class
          const details: Record<string, { total: number; homeless: number }> = {};
          const citizensForHomelessness = citizensResponse.filter(
            cr => (cr.get('SocialClass') as string || 'Unknown').toLowerCase() !== 'forestieri'
          );
          citizensForHomelessness.forEach(citizenRecord => {
            const socialClass = citizenRecord.get('SocialClass') as string || 'Unknown';
            if (!details[socialClass]) {
              details[socialClass] = { total: 0, homeless: 0 };
            }
            details[socialClass].total++;
            const username = citizenRecord.get('Username') as string;
            if (username && !occupiedHomes.includes(username)) {
              details[socialClass].homeless++;
            }
          });
          return details;
        })()
      },
      saved
    });
    
  } catch (error) {
    console.error('Error calculating and saving housing relevancy:', error);
    return NextResponse.json(
      { error: 'Failed to calculate housing relevancy', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to generate housing recommendations based on the situation
function getHousingRecommendation(homelessCount: number, vacantCount: number, score: number): string {
  if (homelessCount === 0 && vacantCount === 0) {
    return `
**Analysis:** The housing market in Venice is perfectly balanced, with all citizens housed and no vacant properties.

**Strategic Opportunities:**
- Monitor the housing market as population changes
- Prepare for future housing needs with planned development
- Maintain current housing policies which are working effectively`;
  }
  
  if (homelessCount > 0 && vacantCount === 0) {
    return `
**Analysis:** Venice is experiencing a critical housing shortage with ${homelessCount} homeless citizens and no vacant homes.

**Strategic Opportunities:**
- Urgent need for new housing construction
- Consider converting non-residential buildings to housing
- Implement housing subsidies to encourage development
- Potential for high returns on new housing investments`;
  }
  
  if (homelessCount === 0 && vacantCount > 0) {
    return `
**Analysis:** Venice has a housing surplus with ${vacantCount} vacant homes and all citizens housed.

**Strategic Opportunities:**
- Potential to acquire properties at favorable prices
- Consider repurposing vacant homes for other uses
- Opportunity to attract new citizens to Venice
- Monitor for potential rent decreases due to oversupply`;
  }
  
  // Both homeless citizens and vacant homes exist
  if (homelessCount > vacantCount) {
    return `
**Analysis:** Despite ${vacantCount} vacant homes, Venice still has ${homelessCount} homeless citizens, suggesting an affordability or allocation issue.

**Strategic Opportunities:**
- Investigate why homeless citizens aren't occupying vacant homes
- Consider rent control or subsidies to improve affordability
- Opportunity for housing brokers to match citizens with homes
- Potential for social housing initiatives`;
  } else {
    return `
**Analysis:** Venice has more vacant homes (${vacantCount}) than homeless citizens (${homelessCount}), indicating a housing mismatch.

**Strategic Opportunities:**
- Potential to acquire properties at competitive prices
- Opportunity to renovate or improve vacant homes to attract occupants
- Consider location and quality factors affecting occupancy
- Investigate if vacant homes meet the needs of homeless citizens`;
  }
}
