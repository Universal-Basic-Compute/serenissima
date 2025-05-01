import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getApiBaseUrl } from '@/lib/apiUtils';

// Define the path to the transactions directory
const TRANSACTIONS_DIR = path.join(process.cwd(), 'data', 'transactions');

// Function to ensure the transactions directory exists
function ensureTransactionsDirExists() {
  if (!fs.existsSync(TRANSACTIONS_DIR)) {
    fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });
  }
  return TRANSACTIONS_DIR;
}

export async function POST(request: Request) {
  try {
    const { type, asset_id, seller, price, historical_name, english_name, description } = await request.json();
    
    // Validate inputs
    if (!type || !asset_id || !seller || !price) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // First try to create the transaction via the backend API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          asset_id,
          seller,
          price,
          historical_name,
          english_name,
          description
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (apiError) {
      console.warn('Backend API not available, falling back to local data:', apiError);
    }
    
    // Fall back to local file handling if API is not available
    
    // Create a new transaction
    const transaction = {
      type,
      asset_id,
      price: Number(price),
      seller,
      buyer: null,
      created_at: new Date().toISOString(),
      executed_at: null,
      historical_name,
      english_name,
      description
    };
    
    // Generate a unique ID for the transaction
    const transactionId = uuidv4();
    
    // Ensure the transactions directory exists
    ensureTransactionsDirExists();
    
    // Save the transaction
    const filePath = path.join(TRANSACTIONS_DIR, `${transactionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(transaction, null, 2));
    
    // Return the created transaction
    return NextResponse.json({
      success: true,
      id: transactionId,
      ...transaction
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}
