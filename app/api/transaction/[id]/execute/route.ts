import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getApiBaseUrl } from '@/lib/apiUtils';

// Define the path to the transactions directory
const TRANSACTIONS_DIR = path.join(process.cwd(), 'data', 'transactions');

// Ensure transactions directory exists
function ensureTransactionsDirExists() {
  if (!fs.existsSync(TRANSACTIONS_DIR)) {
    fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });
  }
  return TRANSACTIONS_DIR;
}

// Add this function to handle the specific Airtable formula error
function isAirtableFormulaError(error: any): boolean {
  const errorStr = String(error);
  return errorStr.includes('INVALID_FILTER_BY_FORMULA') || 
         errorStr.includes('Invalid formula') ||
         errorStr.includes('OR');
}

// Add this function to update user compute balances
async function updateUserComputeBalances(seller: string, buyer: string, amount: number) {
  try {
    console.log(`Updating compute balances: ${seller} +${amount}, ${buyer} -${amount}`);
    
    // First try to update via the backend API
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      
      // Update seller (add funds)
      const sellerResponse = await fetch(`${apiBaseUrl}/api/wallet/${seller}/update-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          compute_amount: amount,
          operation: 'add'
        }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      // Update buyer (subtract funds)
      const buyerResponse = await fetch(`${apiBaseUrl}/api/wallet/${buyer}/update-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          compute_amount: amount,
          operation: 'subtract'
        }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (sellerResponse.ok && buyerResponse.ok) {
        console.log('Successfully updated compute balances via API');
        return true;
      }
    } catch (apiError) {
      console.warn('Backend API not available for compute balance update, falling back to local handling:', apiError);
    }
    
    // Fall back to local file handling if API is not available
    // This would require implementing local user data storage
    // For now, just log that we couldn't update the balances
    console.warn('Local compute balance update not implemented');
    return false;
  } catch (error) {
    console.error('Error updating user compute balances:', error);
    return false;
  }
}

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
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      console.log(`Attempting to execute transaction ${id} via backend API at ${apiBaseUrl}`);
      
      const response = await fetch(`${apiBaseUrl}/api/transaction/${id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buyer }),
        // Add a timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Transaction ${id} executed successfully via backend API`);
        return NextResponse.json(data);
      }
      
      // Handle the specific Airtable formula error
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 500 && (isAirtableFormulaError(errorData.detail || '') || String(errorData.detail || '').includes('OR'))) {
        console.log('Detected Airtable formula error, falling back to local execution');
        // Fall through to local execution
      } else if (response.status !== 404) {
        // If the API returns a specific error, pass it through
        console.warn(`Backend API returned error for transaction ${id}:`, errorData);
        return NextResponse.json(
          errorData,
          { status: response.status }
        );
      }
    } catch (apiError) {
      console.warn(`Backend API not available for transaction ${id}, falling back to local data:`, apiError);
    }
    
    // Fall back to local file handling if API is not available or has Airtable formula errors
    console.log(`Falling back to local file handling for transaction ${id}`);
    
    // Ensure transactions directory exists
    ensureTransactionsDirExists();
    
    // Check if the transaction file exists
    const filePath = path.join(TRANSACTIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`Transaction file not found: ${filePath}`);
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    // Read the transaction
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let transaction;
    
    try {
      transaction = JSON.parse(fileContent);
    } catch (parseError) {
      console.error(`Error parsing transaction file ${filePath}:`, parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid transaction data format' },
        { status: 500 }
      );
    }
    
    // Check if the transaction has already been executed
    if (transaction.executed_at || transaction.buyer) {
      console.warn(`Transaction ${id} has already been executed`);
      return NextResponse.json(
        { success: false, detail: 'Transaction has already been executed' },
        { status: 400 }
      );
    }
    
    // Update the transaction
    transaction.buyer = buyer;
    transaction.executed_at = new Date().toISOString();
    
    // Save the updated transaction
    try {
      fs.writeFileSync(filePath, JSON.stringify(transaction, null, 2));
      console.log(`Transaction ${id} updated successfully`);
    } catch (writeError) {
      console.error(`Error writing transaction file ${filePath}:`, writeError);
      return NextResponse.json(
        { success: false, error: 'Failed to update transaction' },
        { status: 500 }
      );
    }
    
    // After successfully updating the transaction, also update compute balances
    if (transaction.seller && buyer && transaction.price) {
      await updateUserComputeBalances(transaction.seller, buyer, transaction.price);
    }
    
    // Update the land ownership if it's a land transaction
    if (transaction.type === 'land' && transaction.asset_id) {
      console.log(`Updating land ownership for asset ${transaction.asset_id}`);
      
      // Try multiple possible file paths for the land data
      const possiblePaths = [
        path.join(process.cwd(), 'data', `${transaction.asset_id}.json`),
        path.join(process.cwd(), 'data', `polygon-${transaction.asset_id}.json`)
      ];
      
      let landFilePath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          landFilePath = testPath;
          break;
        }
      }
      
      if (landFilePath) {
        try {
          const landContent = fs.readFileSync(landFilePath, 'utf8');
          let land = JSON.parse(landContent);
          
          // Handle different land data formats
          if (Array.isArray(land)) {
            // Old format - just coordinates array
            // Convert to new format with owner
            land = {
              coordinates: land,
              owner: buyer
            };
          } else {
            // New format - update owner
            land.owner = buyer;
          }
          
          // Save the updated land
          fs.writeFileSync(landFilePath, JSON.stringify(land, null, 2));
          console.log(`Land ownership updated for ${transaction.asset_id}`);
          
          // After updating the land file, also try to update the land owner in the backend
          try {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
            const landUpdateResponse = await fetch(`${apiBaseUrl}/api/land/${transaction.asset_id}/update-owner`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                owner: buyer
              }),
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (landUpdateResponse.ok) {
              console.log(`Successfully updated land owner in backend for ${transaction.asset_id}`);
            }
          } catch (landUpdateError) {
            console.warn(`Could not update land owner in backend for ${transaction.asset_id}:`, landUpdateError);
          }
        } catch (landError) {
          console.error(`Error updating land ownership for ${transaction.asset_id}:`, landError);
          // Continue execution even if land update fails
        }
      } else {
        console.warn(`Land file not found for asset ${transaction.asset_id}`);
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
