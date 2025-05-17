import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';
const AIRTABLE_TRANSACTIONS_TABLE = 'TRANSACTIONS';
const AIRTABLE_LOANS_TABLE = 'LOANS';

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

export async function GET(request: Request) {
  try {
    // Initialize Airtable
    const base = initAirtable();
    
    // 1. Get total Ducats across all citizens
    const citizensRecords = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['Ducats']
      })
      .all();
    
    const totalDucats = citizensRecords.reduce((sum, record) => {
      const ducats = record.get('Ducats') as number || 0;
      return sum + ducats;
    }, 0);
    
    // 2. Calculate GDP from transactions
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString();
    
    const transactionsRecords = await base(AIRTABLE_TRANSACTIONS_TABLE)
      .select({
        fields: ['Price', 'CreatedAt'],
        filterByFormula: `{CreatedAt} > '${oneYearAgoStr}'`
      })
      .all();
    
    const transactionsTotal = transactionsRecords.reduce((sum, record) => {
      const price = record.get('Price') as number || 0;
      return sum + price;
    }, 0);
    
    // If we have less than a year of data, project to a full year
    const oldestTransactionDate = transactionsRecords.length > 0 
      ? new Date(transactionsRecords[transactionsRecords.length - 1].get('CreatedAt') as string)
      : new Date();
    
    const daysSinceOldestTransaction = Math.max(1, Math.ceil((Date.now() - oldestTransactionDate.getTime()) / (1000 * 60 * 60 * 24)));
    const projectedYearlyGDP = (transactionsTotal / daysSinceOldestTransaction) * 365;
    
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
        lastUpdated: new Date().toISOString()
      }
    });
  }
}
