import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the path to the transactions directory
const TRANSACTIONS_DIR = path.join(process.cwd(), 'data', 'transactions');

// Function to ensure the transactions directory exists
function ensureTransactionsDirExists() {
  if (!fs.existsSync(TRANSACTIONS_DIR)) {
    fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });
  }
  return TRANSACTIONS_DIR;
}

// Function to get all available transactions
function getAvailableTransactions() {
  const transactionsDir = ensureTransactionsDirExists();
  
  // Check if the directory exists
  if (!fs.existsSync(transactionsDir)) {
    return [];
  }
  
  // Read all JSON files in the directory
  const files = fs.readdirSync(transactionsDir).filter(file => file.endsWith('.json'));
  
  // Load and filter available transactions (those without a buyer)
  const availableTransactions = files
    .map(file => {
      try {
        const filePath = path.join(transactionsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const transaction = JSON.parse(fileContent);
        
        // Add the file ID to the transaction
        transaction.id = file.replace('.json', '');
        
        return transaction;
      } catch (error) {
        console.error(`Error reading transaction file ${file}:`, error);
        return null;
      }
    })
    .filter(transaction => 
      transaction !== null && 
      transaction.seller && 
      !transaction.buyer && 
      !transaction.executed_at
    );
  
  return availableTransactions;
}

export async function GET() {
  try {
    // First try to fetch from the backend API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/transactions/available`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (apiError) {
      console.warn('Backend API not available, falling back to local data:', apiError);
    }
    
    // If backend API fails, fall back to local data
    const transactions = getAvailableTransactions();
    
    // If no transactions are found, return an empty array
    if (!transactions || transactions.length === 0) {
      return NextResponse.json([]);
    }
    
    // Return the available transactions
    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching available transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch available transactions' },
      { status: 500 }
    );
  }
}
