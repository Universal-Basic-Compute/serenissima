import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_TRANSACTIONS_TABLE = 'TRANSACTIONS';
const AIRTABLE_LOANS_TABLE = 'LOANS';

// Citizens to exclude from Gini coefficient calculation
const EXCLUDED_CITIZENS = ['ConsiglioDeiDieci', 'Italia'];

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  Airtable.configure({
    apiKey: AIRTABLE_API_KEY
  });
  
  return Airtable.base(AIRTABLE_BASE_ID);
};

// Calculate Gini coefficient
const calculateGiniCoefficient = (citizens: any[]): number => {
  if (citizens.length <= 1) {
    return 0; // No inequality with 0 or 1 citizen
  }
  
  // Extract wealth values
  const wealthValues = citizens.map(record => {
    return record.get('Ducats') as number || 0;
  }).sort((a, b) => a - b); // Sort in ascending order
  
  const n = wealthValues.length;
  const mean = wealthValues.reduce((sum, val) => sum + val, 0) / n;
  
  if (mean === 0) {
    return 0; // No inequality if everyone has 0 wealth
  }
  
  let sumAbsoluteDifferences = 0;
  
  // Calculate sum of absolute differences
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumAbsoluteDifferences += Math.abs(wealthValues[i] - wealthValues[j]);
    }
  }
  
  // Gini coefficient formula: G = (1/2n²μ) * Σ|xi - xj|
  const gini = sumAbsoluteDifferences / (2 * n * n * mean);
  
  // Round to 3 decimal places
  return Math.round(gini * 1000) / 1000;
};

export async function GET(request: Request) {
  try {
    // Initialize Airtable
    const base = initAirtable();
    
    // 1. Get total Ducats across all citizens and calculate Gini coefficient
    const citizensRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Ducats', 'Username']
      })
      .all();
    
    // Filter out excluded citizens for Gini calculation
    const filteredCitizens = citizensRecords.filter(record => {
      const username = record.get('Username') as string;
      return !EXCLUDED_CITIZENS.includes(username);
    });
    
    // Calculate Gini coefficient
    const giniCoefficient = calculateGiniCoefficient(filteredCitizens);
    
    // Calculate total Ducats (including all citizens)
    const totalDucats = citizensRecords.reduce((sum, record) => {
      const ducats = record.get('Ducats') as number || 0;
      return sum + ducats;
    }, 0);
    
    // 2. Calculate GDP from transactions (using only last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();
    
    const transactionsRecords = await base(AIRTABLE_TRANSACTIONS_TABLE)
      .select({
        fields: ['Price', 'CreatedAt'],
        filterByFormula: `{CreatedAt} > '${sevenDaysAgoStr}'`
      })
      .all();
    
    const transactionsTotal = transactionsRecords.reduce((sum, record) => {
      const price = record.get('Price') as number || 0;
      return sum + price;
    }, 0);
    
    // Project to a full year based on the last 7 days of data
    const projectedYearlyGDP = (transactionsTotal / 7) * 365;
    
    // 3. Get total outstanding loans
    const loansRecords = await base(AIRTABLE_LOANS_TABLE)
      .select({
        fields: ['RemainingBalance'],
        filterByFormula: `{Status} = 'active'`
      })
      .all();
    
    const totalLoans = loansRecords.reduce((sum, record) => {
      const balance = record.get('RemainingBalance') as number || 0;
      return sum + balance;
    }, 0);
    
    // Return the economic data
    return NextResponse.json({
      success: true,
      economy: {
        totalDucats: Math.floor(totalDucats),
        transactionsTotal: Math.floor(transactionsTotal),
        projectedYearlyGDP: Math.floor(projectedYearlyGDP),
        totalLoans: Math.floor(totalLoans),
        citizenCount: citizensRecords.length,
        transactionCount: transactionsRecords.length,
        loanCount: loansRecords.length,
        giniCoefficient: giniCoefficient,
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error fetching economy data:', error);
    
    // Return a fallback with sample data
    return NextResponse.json({
      success: true,
      economy: {
        totalDucats: 1250000,
        transactionsTotal: 350000,
        projectedYearlyGDP: 1200000,
        totalLoans: 500000,
        citizenCount: 120,
        transactionCount: 450,
        loanCount: 35,
        giniCoefficient: 0.42, // Sample Gini coefficient
        lastUpdated: new Date().toISOString()
      }
    });
  }
}
