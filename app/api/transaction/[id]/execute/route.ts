import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getApiBaseUrl } from '@/lib/apiUtils';

// Define the path to the transactions directory
const TRANSACTIONS_DIR = path.join(process.cwd(), 'data', 'transactions');

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { buyer } = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }
    
    if (!buyer) {
      return NextResponse.json(
        { success: false, error: 'Buyer address is required' },
        { status: 400 }
      );
    }
    
    // First try to execute the transaction via the backend API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/transaction/${id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buyer }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
      
      // If the API returns a specific error, pass it through
      if (response.status !== 404) {
        const errorData = await response.json();
        return NextResponse.json(
          errorData,
          { status: response.status }
        );
      }
    } catch (apiError) {
      console.warn('Backend API not available, falling back to local data:', apiError);
    }
    
    // Fall back to local file handling if API is not available
    
    // Check if the transaction file exists
    const filePath = path.join(TRANSACTIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    // Read the transaction
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const transaction = JSON.parse(fileContent);
    
    // Check if the transaction has already been executed
    if (transaction.executed_at || transaction.buyer) {
      return NextResponse.json(
        { success: false, detail: 'Transaction has already been executed' },
        { status: 400 }
      );
    }
    
    // Update the transaction
    transaction.buyer = buyer;
    transaction.executed_at = new Date().toISOString();
    
    // Save the updated transaction
    fs.writeFileSync(filePath, JSON.stringify(transaction, null, 2));
    
    // Update the land ownership if it's a land transaction
    if (transaction.type === 'land' && transaction.asset_id) {
      const landFilePath = path.join(process.cwd(), 'data', `${transaction.asset_id}.json`);
      if (fs.existsSync(landFilePath)) {
        const landContent = fs.readFileSync(landFilePath, 'utf8');
        const land = JSON.parse(landContent);
        
        // Update the owner
        land.owner = buyer;
        
        // Save the updated land
        fs.writeFileSync(landFilePath, JSON.stringify(land, null, 2));
      }
    }
    
    // Return the updated transaction
    return NextResponse.json({
      success: true,
      transaction: {
        ...transaction,
        id
      }
    });
  } catch (error) {
    console.error('Error executing transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute transaction' },
      { status: 500 }
    );
  }
}
