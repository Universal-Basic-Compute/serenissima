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
        fields: ['Username', 'FirstName', 'LastName', 'SocialClass']
      })
      .all();
    
    // Fetch all buildings with category "business"
    const businessBuildingsResponse = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: '{Category} = "business"',
        fields: ['BuildingId', 'Type', 'Occupant', 'Owner', 'RunBy', 'Wages']
      })
      .all();
    
    // Count citizens who are unemployed (not in Occupant field of any business building)
    const occupiedBusinesses = businessBuildingsResponse
      .filter(building => building.get('Occupant'))
      .map(building => building.get('Occupant') as string);

    // Filter citizens to exclude 'Forestieri' and 'Nobili' for job market statistics
    const relevantCitizensForJobStats = citizensResponse.filter(citizen => {
      const socialClass = (citizen.get('SocialClass') as string || 'Unknown').toLowerCase();
      return socialClass !== 'forestieri' && socialClass !== 'nobili';
    });
    
    const unemployedCitizens = relevantCitizensForJobStats
      .filter(citizen => {
        const username = citizen.get('Username') as string;
        return username && !occupiedBusinesses.includes(username);
      });
    
    // Count vacant jobs (business buildings with no Occupant)
    const vacantJobs = businessBuildingsResponse
      .filter(building => {
        const occupant = building.get('Occupant');
        // Consider a job vacant only if Occupant field is empty, null, or undefined
        return occupant === null || occupant === undefined || occupant === '' || 
               (typeof occupant === 'string' && occupant.trim() === '');
      });
    
    console.log(`Found ${businessBuildingsResponse.length} total business buildings`);
    console.log(`Found ${vacantJobs.length} vacant jobs`);
    
    // Add detailed logging to help diagnose occupancy issues
    console.log(`Detailed job occupancy analysis:`);
    businessBuildingsResponse.forEach(building => {
      const buildingId = building.get('BuildingId');
      const occupant = building.get('Occupant');
      const occupantType = typeof occupant;
      console.log(`Building ${buildingId}: Occupant=${occupant}, Type=${occupantType}, IsEmpty=${!occupant || occupant === ''}`);
    });
    console.log(`Found ${unemployedCitizens.length} unemployed citizens out of ${relevantCitizensForJobStats.length} relevant citizens (excluding Forestieri & Nobili). Total citizens fetched: ${citizensResponse.length}.`);
    
    // Calculate job market statistics based on relevant citizens
    const totalCitizens = relevantCitizensForJobStats.length; // Use filtered list for total
    const totalJobs = businessBuildingsResponse.length;
    const unemployedCount = unemployedCitizens.length;
    const vacantCount = vacantJobs.length;
    
    // Calculate unemployment rate and vacancy rate
    const unemploymentRate = totalCitizens > 0 ? (unemployedCount / totalCitizens) * 100 : 0;
    const vacancyRate = totalJobs > 0 ? (vacantCount / totalJobs) * 100 : 0;
    
    // Calculate average wages for vacant jobs
    const totalWages = vacantJobs.reduce((sum, job) => {
      const wages = job.get('Wages');
      return sum + (typeof wages === 'number' ? wages : 0);
    }, 0);
    const averageWages = vacantJobs.length > 0 ? totalWages / vacantJobs.length : 0;
    
    // Group vacant jobs by type
    const jobsByType: Record<string, number> = {};
    vacantJobs.forEach(job => {
      const type = job.get('Type') as string || 'Unknown';
      jobsByType[type] = (jobsByType[type] || 0) + 1;
    });
    
    // Calculate job market relevancy score
    // Higher score means more job market issues (more unemployment, fewer vacancies)
    // Score ranges from 0-100
    let relevancyScore = 0;
    
    if (vacantCount === 0 && unemployedCount > 0) {
      // Critical job shortage: no vacant jobs but unemployed citizens exist
      relevancyScore = 100;
    } else if (vacantCount > 0 && unemployedCount > 0) {
      // Job market mismatch: both vacant jobs and unemployed citizens exist
      // Score based on ratio of unemployed to vacant (higher ratio = higher score)
      const ratio = unemployedCount / vacantCount;
      relevancyScore = Math.min(90, Math.max(50, ratio * 30));
    } else if (vacantCount > 0 && unemployedCount === 0) {
      // Labor shortage: vacant jobs but no unemployed citizens
      // Score based on vacancy rate (higher vacancy = higher score)
      relevancyScore = Math.max(60, 50 + (vacancyRate * 0.5));
    } else {
      // Perfect balance: no unemployed citizens and no vacant jobs
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
    const jobMarketRelevancy = {
      score: relevancyScore,
      asset: 'venice_job_market',
      assetType: 'city',
      category: 'employment',
      type: 'job_market_situation',
      targetCitizen: 'ConsiglioDeiDieci',
      relevantToCitizen: 'all',
      title: `Job Market Situation in Venice`,
      description: `
### Venice Job Market Report

**Current Statistics:**
- **Unemployed Citizens:** ${unemployedCount} (${unemploymentRate.toFixed(1)}% of population)
- **Vacant Jobs:** ${vacantCount} (${vacancyRate.toFixed(1)}% vacancy rate)
- **Total Citizens:** ${totalCitizens}
- **Total Jobs:** ${totalJobs}
- **Average Wages for Vacant Positions:** ${averageWages.toFixed(1)} Ducats

${getJobMarketRecommendation(unemployedCount, vacantCount, relevancyScore, jobsByType, averageWages)}
      `.trim(),
      timeHorizon,
      status
    };
    
    return NextResponse.json({
      success: true,
      jobMarketRelevancy,
      statistics: {
        unemployedCount,
        vacantCount,
        totalCitizens,
        totalJobs,
        unemploymentRate: unemploymentRate.toFixed(1),
        vacancyRate: vacancyRate.toFixed(1),
        averageWages: averageWages.toFixed(1),
        jobsByType
      }
    });
    
  } catch (error) {
    console.error('Error calculating job market relevancy:', error);
    return NextResponse.json(
      { error: 'Failed to calculate job market relevancy', details: error.message },
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
        fields: ['Username', 'FirstName', 'LastName', 'SocialClass']
      })
      .all();
    
    // Fetch all buildings with category "business"
    const businessBuildingsResponse = await base(AIRTABLE_BUILDINGS_TABLE)
      .select({
        filterByFormula: '{Category} = "business"',
        fields: ['BuildingId', 'Type', 'Occupant', 'Owner', 'RunBy', 'Wages']
      })
      .all();
    
    // Count citizens who are unemployed (not in Occupant field of any business building)
    const occupiedBusinesses = businessBuildingsResponse
      .filter(building => building.get('Occupant'))
      .map(building => building.get('Occupant') as string);

    // Filter citizens to exclude 'Forestieri' and 'Nobili' for job market statistics
    const relevantCitizensForJobStats = citizensResponse.filter(citizen => {
      const socialClass = (citizen.get('SocialClass') as string || 'Unknown').toLowerCase();
      return socialClass !== 'forestieri' && socialClass !== 'nobili';
    });
    
    const unemployedCitizens = relevantCitizensForJobStats
      .filter(citizen => {
        const username = citizen.get('Username') as string;
        return username && !occupiedBusinesses.includes(username);
      });
    
    // Count vacant jobs (business buildings with no Occupant)
    const vacantJobs = businessBuildingsResponse
      .filter(building => {
        const occupant = building.get('Occupant');
        // Consider a job vacant only if Occupant field is empty, null, or undefined
        return occupant === null || occupant === undefined || occupant === '' || 
               (typeof occupant === 'string' && occupant.trim() === '');
      });
    
    // Calculate job market statistics based on relevant citizens
    const totalCitizens = relevantCitizensForJobStats.length; // Use filtered list for total
    const totalJobs = businessBuildingsResponse.length;
    const unemployedCount = unemployedCitizens.length;
    const vacantCount = vacantJobs.length;
    
    // Calculate unemployment rate and vacancy rate
    const unemploymentRate = totalCitizens > 0 ? (unemployedCount / totalCitizens) * 100 : 0;
    const vacancyRate = totalJobs > 0 ? (vacantCount / totalJobs) * 100 : 0;
    
    // Calculate average wages for vacant jobs
    const totalWages = vacantJobs.reduce((sum, job) => {
      const wages = job.get('Wages');
      return sum + (typeof wages === 'number' ? wages : 0);
    }, 0);
    const averageWages = vacantJobs.length > 0 ? totalWages / vacantJobs.length : 0;
    
    // Group vacant jobs by type
    const jobsByType: Record<string, number> = {};
    vacantJobs.forEach(job => {
      const type = job.get('Type') as string || 'Unknown';
      jobsByType[type] = (jobsByType[type] || 0) + 1;
    });
    
    // Calculate job market relevancy score
    // Higher score means more job market issues (more unemployment, fewer vacancies)
    let relevancyScore = 0;
    
    if (vacantCount === 0 && unemployedCount > 0) {
      // Critical job shortage: no vacant jobs but unemployed citizens exist
      relevancyScore = 100;
    } else if (vacantCount > 0 && unemployedCount > 0) {
      // Job market mismatch: both vacant jobs and unemployed citizens exist
      // Score based on ratio of unemployed to vacant (higher ratio = higher score)
      const ratio = unemployedCount / vacantCount;
      relevancyScore = Math.min(90, Math.max(50, ratio * 30));
    } else if (vacantCount > 0 && unemployedCount === 0) {
      // Labor shortage: vacant jobs but no unemployed citizens
      // Score based on vacancy rate (higher vacancy = higher score)
      relevancyScore = Math.max(60, 50 + (vacancyRate * 0.5));
    } else {
      // Perfect balance: no unemployed citizens and no vacant jobs
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
    const jobMarketRelevancy = {
      score: relevancyScore,
      asset: 'venice_job_market',
      assetType: 'city',
      category: 'employment',
      type: 'job_market_situation',
      targetCitizen: 'ConsiglioDeiDieci',
      relevantToCitizen: 'all',
      title: `Job Market Situation in Venice`,
      description: `
### Venice Job Market Report

**Current Statistics:**
- **Unemployed Citizens:** ${unemployedCount} (${unemploymentRate.toFixed(1)}% of population)
- **Vacant Jobs:** ${vacantCount} (${vacancyRate.toFixed(1)}% vacancy rate)
- **Total Citizens:** ${totalCitizens}
- **Total Jobs:** ${totalJobs}
- **Average Wages for Vacant Positions:** ${averageWages.toFixed(1)} Ducats

${getJobMarketRecommendation(unemployedCount, vacantCount, relevancyScore, jobsByType, averageWages)}
      `.trim(),
      timeHorizon,
      status
    };
    
    // Create a map of relevancies to save
    const relevancies: Record<string, any> = {
      'venice_job_market': jobMarketRelevancy
    };
    
    // Save to Airtable as a global relevancy
    let saved = false;
    try {
      // Create a modified job market relevancy with targetCitizen and relevantToCitizen set to 'all'
      const globalJobMarketRelevancy = {
        ...jobMarketRelevancy,
        targetCitizen: 'all',
        relevantToCitizen: 'all'
      };
      
      // Initialize Airtable directly to bypass the deletion logic in saveRelevancies
      const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
      const AIRTABLE_RELEVANCIES_TABLE = 'RELEVANCIES';
      
      // Create a unique ID for this relevancy
      const relevancyId = `global_job_market_${Date.now()}`;
      
      // Create the relevancy record directly
      await base(AIRTABLE_RELEVANCIES_TABLE).create({
        RelevancyId: relevancyId,
        Asset: 'venice_job_market',
        AssetType: 'city',
        Category: 'employment',
        Type: 'job_market_situation',
        TargetCitizen: 'ConsiglioDeiDieci',
        RelevantToCitizen: 'all',
        Score: globalJobMarketRelevancy.score,
        TimeHorizon: globalJobMarketRelevancy.timeHorizon,
        Title: globalJobMarketRelevancy.title,
        Description: globalJobMarketRelevancy.description,
        Status: globalJobMarketRelevancy.status,
        CreatedAt: new Date().toISOString()
      });
      
      console.log('Successfully saved global job market relevancy directly to Airtable');
      saved = true;
    } catch (error) {
      console.error('Error saving job market relevancy to Airtable:', error);
    }
    
    return NextResponse.json({
      success: true,
      jobMarketRelevancy,
      statistics: {
        unemployedCount,
        vacantCount,
        totalCitizens,
        totalJobs,
        unemploymentRate: unemploymentRate.toFixed(1),
        vacancyRate: vacancyRate.toFixed(1),
        averageWages: averageWages.toFixed(1),
        jobsByType
      },
      saved
    });
    
  } catch (error) {
    console.error('Error calculating and saving job market relevancy:', error);
    return NextResponse.json(
      { error: 'Failed to calculate job market relevancy', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to generate job market recommendations based on the situation
function getJobMarketRecommendation(
  unemployedCount: number, 
  vacantCount: number, 
  score: number,
  jobsByType: Record<string, number>,
  averageWages: number
): string {
  // Format job types for display
  const jobTypesList = Object.entries(jobsByType)
    .map(([type, count]) => `**${count}** ${formatJobType(type)}`)
    .join(', ');
  
  if (unemployedCount === 0 && vacantCount === 0) {
    return `
**Analysis:** The job market in Venice is perfectly balanced, with all citizens employed and no vacant positions.

**Strategic Opportunities:**
- Monitor the job market as population changes
- Prepare for future workforce needs with training programs
- Maintain current employment policies which are working effectively`;
  }
  
  if (unemployedCount > 0 && vacantCount === 0) {
    return `
**Analysis:** Venice is experiencing a critical job shortage with ${unemployedCount} unemployed citizens and no vacant positions.

**Strategic Opportunities:**
- Urgent need for new business development
- Consider converting or expanding existing businesses
- Implement incentives to encourage business creation
- Potential for high returns on new business investments`;
  }
  
  if (unemployedCount === 0 && vacantCount > 0) {
    return `
**Analysis:** Venice has a labor shortage with ${vacantCount} vacant positions and all citizens employed.

**Strategic Opportunities:**
- Businesses may need to increase wages to attract workers
- Consider recruiting citizens from outside Venice
- Opportunity to automate certain business functions
- Monitor for potential wage inflation due to labor scarcity

**Available Positions:** ${jobTypesList}`;
  }
  
  // Both unemployed citizens and vacant jobs exist
  if (unemployedCount > vacantCount) {
    return `
**Analysis:** Despite ${vacantCount} vacant positions, Venice still has ${unemployedCount} unemployed citizens, suggesting a skills mismatch or wage issue.

**Strategic Opportunities:**
- Investigate why unemployed citizens aren't filling vacant positions
- Consider training programs to address skills gaps
- Opportunity for job placement services to match citizens with positions
- Businesses may need to adjust wages (current average: ${averageWages.toFixed(1)} Ducats)

**Available Positions:** ${jobTypesList}`;
  } else {
    return `
**Analysis:** Venice has more vacant positions (${vacantCount}) than unemployed citizens (${unemployedCount}), indicating a labor shortage.

**Strategic Opportunities:**
- Businesses may need to compete for available workers
- Opportunity to attract new citizens to Venice
- Consider location and skill factors affecting employment
- Potential for wage increases as businesses compete for workers

**Available Positions:** ${jobTypesList}`;
  }
}

// Helper function to format job types for display
function formatJobType(type: string): string {
  if (!type) return 'jobs';
  
  // Replace underscores with spaces
  let formatted = type.replace(/_/g, ' ');
  
  // Make plural if not already
  if (!formatted.endsWith('s')) {
    formatted += 's';
  }
  
  return formatted;
}
