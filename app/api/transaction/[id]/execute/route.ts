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

// Add this function to get username from wallet address with better error handling
async function getUsernameFromWallet(walletAddress: string): Promise<string> {
  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${apiBaseUrl}/api/wallet/${walletAddress}`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.user_name) {
        console.log(`Found username ${data.user_name} for wallet ${walletAddress}`);
        return data.user_name;
      }
    }
    
    // If we couldn't get a username, use the wallet address as a fallback
    console.warn(`Could not find username for wallet ${walletAddress}, using wallet as username`);
    return walletAddress;
  } catch (error) {
    console.error(`Error getting username for wallet ${walletAddress}:`, error);
    // Return the wallet address as a fallback
    return walletAddress;
  }
}

// Add this function to update user compute balances
async function updateUserComputeBalances(seller: string, buyer: string, amount: number) {
  try {
    console.log(`Updating compute balances: ${seller} +${amount}, ${buyer} -${amount}`);
    
    // First try to update via the backend API
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      
      // Try a direct transfer API call first (atomic operation)
      const transferResponse = await fetch(`${apiBaseUrl}/api/transfer-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_wallet: buyer,
          to_wallet: seller,
          compute_amount: amount
        }),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (transferResponse.ok) {
        console.log('Successfully transferred compute via direct API call');
        return true;
      }
      
      console.warn('Direct transfer API call failed, falling back to separate updates');
      
      // Fallback: Update seller (add funds)
      const sellerResponse = await fetch(`${apiBaseUrl}/api/wallet/${seller}/update-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          compute_amount: amount,
          operation: 'add'
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
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
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (sellerResponse.ok && buyerResponse.ok) {
        console.log('Successfully updated compute balances via API');
        
        // Dispatch an event to update the UI with the new compute balances
        // This will be caught by the client to update the UI
        const sellerData = await sellerResponse.json();
        const buyerData = await buyerResponse.json();
        
        console.log('Updated compute balances:', {
          seller: sellerData.compute_amount,
          buyer: buyerData.compute_amount
        });
        
        // Try to update local storage for the current user if they're the buyer or seller
        try {
          const currentWallet = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
          if (currentWallet) {
            if (currentWallet === seller) {
              const storedProfile = localStorage.getItem('userProfile');
              if (storedProfile) {
                const profile = JSON.parse(storedProfile);
                profile.computeAmount = sellerData.compute_amount;
                localStorage.setItem('userProfile', JSON.stringify(profile));
                console.log('Updated seller profile in localStorage');
              }
            } else if (currentWallet === buyer) {
              const storedProfile = localStorage.getItem('userProfile');
              if (storedProfile) {
                const profile = JSON.parse(storedProfile);
                profile.computeAmount = buyerData.compute_amount;
                localStorage.setItem('userProfile', JSON.stringify(profile));
                console.log('Updated buyer profile in localStorage');
              }
            }
          }
        } catch (storageError) {
          console.warn('Error updating localStorage:', storageError);
        }
        
        return true;
      } else {
        console.warn('API returned non-OK response for compute balance update');
        if (!sellerResponse.ok) {
          console.warn(`Seller update failed: ${sellerResponse.status}`);
          try {
            const errorData = await sellerResponse.json();
            console.warn('Seller error details:', errorData);
          } catch (e) {}
        }
        if (!buyerResponse.ok) {
          console.warn(`Buyer update failed: ${buyerResponse.status}`);
          try {
            const errorData = await buyerResponse.json();
            console.warn('Buyer error details:', errorData);
          } catch (e) {}
        }
      }
    } catch (apiError) {
      console.warn('Backend API not available for compute balance update, falling back to local handling:', apiError);
    }
    
    // Fall back to local file handling if API is not available
    try {
      // Direct API call to transfer compute
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      
      // Try a direct transfer API call as fallback
      const transferResponse = await fetch(`${apiBaseUrl}/api/transfer-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_wallet: buyer,
          to_wallet: seller,
          compute_amount: amount
        }),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (transferResponse.ok) {
        console.log('Successfully transferred compute via direct API call');
        return true;
      }
      
      console.warn('Direct transfer API call failed, compute balance update may not be complete');
    } catch (directApiError) {
      console.error('Error with direct transfer API call:', directApiError);
    }
    
    // If all else fails, log the failure
    console.warn('All compute balance update methods failed');
    return false;
  } catch (error) {
    console.error('Error updating user compute balances:', error);
    return false;
  }
}

// Add this function to handle the specific Airtable formula error
function isAirtableFormulaError(error: any): boolean {
  const errorStr = String(error);
  return errorStr.includes('INVALID_FILTER_BY_FORMULA') || 
         errorStr.includes('Invalid formula') ||
         errorStr.includes('OR');
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`Transaction execution started for ID: ${params.id}`);
    const { id } = params;
    const { buyer } = await request.json();
    
    if (!id) {
      console.error('Transaction execution failed: Missing transaction ID');
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }
    
    if (!buyer) {
      console.error('Transaction execution failed: Missing buyer address');
      return NextResponse.json(
        { success: false, error: 'Buyer address is required' },
        { status: 400 }
      );
    }
    
    // Convert wallet address to username
    const buyerUsername = await getUsernameFromWallet(buyer);
    console.log(`Processing transaction ${id} for buyer ${buyerUsername} (wallet: ${buyer})`);
    
    // First try to execute the transaction via the backend API
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      console.log(`Attempting to execute transaction ${id} via backend API at ${apiBaseUrl}`);
      
      const response = await fetch(`${apiBaseUrl}/api/transaction/${id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          buyer: buyerUsername,  // Send username instead of wallet address
          wallet: buyer  // Also send wallet for reference
        }),
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
      
    // Update the land ownership if it's a land transaction
    if (transaction.type === 'land' && transaction.asset_id) {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          
        // Update the land owner in Airtable
        const landUpdateResponse = await fetch(`${apiBaseUrl}/api/land/${transaction.asset_id}/update-owner`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            owner: buyer,
            wallet: buyer
          }),
          signal: AbortSignal.timeout(10000)
        });
          
        if (landUpdateResponse.ok) {
          console.log(`Successfully updated land owner in Airtable for ${transaction.asset_id}`);
        } else {
          console.warn(`Failed to update land owner in Airtable: ${landUpdateResponse.status}`);
            
          // Try to create a new land record if update fails
          const landCreateResponse = await fetch(`${apiBaseUrl}/api/land`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              land_id: transaction.asset_id,
              user: buyer,
              wallet_address: buyer
            }),
            signal: AbortSignal.timeout(10000)
          });
            
          if (landCreateResponse.ok) {
            console.log(`Created new land record for ${transaction.asset_id} with owner ${buyer}`);
          } else {
            console.warn(`Failed to create land record: ${landCreateResponse.status}`);
          }
        }
      } catch (landUpdateError) {
        console.warn(`Could not update land owner in Airtable for ${transaction.asset_id}:`, landUpdateError);
      }
    }
      
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
      // Get the username for the buyer's wallet address with retry logic
      let buyerUsername = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && buyerUsername === null) {
        try {
          console.log(`Attempt ${retryCount + 1} to get username for wallet ${buyer}`);
          buyerUsername = await getUsernameFromWallet(buyer);
          if (buyerUsername) {
            console.log(`Successfully retrieved username: ${buyerUsername} for wallet ${buyer}`);
          } else {
            console.warn(`No username found for wallet ${buyer} on attempt ${retryCount + 1}`);
          }
        } catch (error) {
          console.error(`Error getting username on attempt ${retryCount + 1}:`, error);
        }
        
        if (buyerUsername === null && retryCount < maxRetries - 1) {
          // Wait with exponential backoff before retrying
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Waiting ${delay}ms before retry ${retryCount + 2}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        retryCount++;
      }
      
      // Use the username if available, otherwise fall back to wallet address
      const ownerToSet = buyerUsername || buyer;
      console.log(`Setting land owner to: ${ownerToSet} (username: ${buyerUsername}, wallet: ${buyer})`);
      
      // Update compute balances using the wallet addresses (not usernames)
      console.log(`Updating compute balances: ${transaction.seller} +${transaction.price}, ${buyer} -${transaction.price}`);
      
      // Try multiple times with increasing delays to update compute balances
      let balanceUpdateSuccess = false;
      const maxBalanceRetries = 5;
      
      for (let i = 0; i < maxBalanceRetries; i++) {
        if (i > 0) {
          const delay = Math.pow(2, i) * 1000; // Exponential backoff
          console.log(`Balance update attempt ${i+1}/${maxBalanceRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const balanceUpdateResult = await updateUserComputeBalances(transaction.seller, buyer, transaction.price);
        
        if (balanceUpdateResult) {
          console.log(`Successfully updated compute balances on attempt ${i+1}: ${transaction.seller} +${transaction.price}, ${buyer} -${transaction.price}`);
          balanceUpdateSuccess = true;
          break;
        } else {
          console.warn(`Failed to update compute balances on attempt ${i+1}`);
        }
      }
      
      if (!balanceUpdateSuccess) {
        console.error('All attempts to update compute balances failed. Transaction was completed but balances may not be accurate.');
        
        // Dispatch an event to notify the frontend that balances need to be refreshed
        try {
          // Create a file to indicate balance update failure for this transaction
          const balanceUpdateFailurePath = path.join(process.cwd(), 'data', 'balance-update-failures', `${id}.json`);
          const balanceUpdateFailureDir = path.dirname(balanceUpdateFailurePath);
          
          if (!fs.existsSync(balanceUpdateFailureDir)) {
            fs.mkdirSync(balanceUpdateFailureDir, { recursive: true });
          }
          
          fs.writeFileSync(balanceUpdateFailurePath, JSON.stringify({
            transaction_id: id,
            seller: transaction.seller,
            buyer: buyer,
            amount: transaction.price,
            timestamp: new Date().toISOString()
          }, null, 2));
          
          console.log(`Created balance update failure record at ${balanceUpdateFailurePath}`);
        } catch (fileError) {
          console.error('Error creating balance update failure record:', fileError);
        }
      }
    }
    
    // Update the land ownership if it's a land transaction
    if (transaction.type === 'land' && transaction.asset_id) {
      console.log(`Updating land ownership for asset ${transaction.asset_id}`);
              
      // Get the username for the buyer's wallet address with retry logic
      let buyerUsername = null;
      let retryCount = 0;
      const maxRetries = 3;
        
      while (retryCount < maxRetries && buyerUsername === null) {
        try {
          console.log(`Attempt ${retryCount + 1} to get username for wallet ${buyer}`);
          buyerUsername = await getUsernameFromWallet(buyer);
          if (buyerUsername) {
            console.log(`Successfully retrieved username: ${buyerUsername} for wallet ${buyer}`);
          } else {
            console.warn(`No username found for wallet ${buyer} on attempt ${retryCount + 1}`);
          }
        } catch (error) {
          console.error(`Error getting username on attempt ${retryCount + 1}:`, error);
        }
          
        if (buyerUsername === null && retryCount < maxRetries - 1) {
          // Wait with exponential backoff before retrying
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Waiting ${delay}ms before retry ${retryCount + 2}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
          
        retryCount++;
      }
        
      // Use the username if available, otherwise fall back to wallet address
      const ownerToSet = buyerUsername || buyer;
      console.log(`Setting land owner to: ${ownerToSet} (username: ${buyerUsername}, wallet: ${buyer})`);
              
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
              owner: ownerToSet // Use username instead of wallet address
            };
          } else {
            // New format - update owner
            land.owner = ownerToSet; // Use username instead of wallet address
          }
                  
          // Save the updated land
          fs.writeFileSync(landFilePath, JSON.stringify(land, null, 2));
          console.log(`Land ownership updated for ${transaction.asset_id}`);
                  
          // After updating the land file, also try to update the land owner in the backend
          try {
            // Try multiple API endpoints to ensure the land ownership is updated
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
                    
            // First try the update-owner endpoint
            try {
              const landUpdateResponse = await fetch(`${apiBaseUrl}/api/land/${transaction.asset_id}/update-owner`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  owner: ownerToSet, // Use username instead of wallet address
                  wallet: buyer // Also include the wallet address for consistency
                }),
                signal: AbortSignal.timeout(10000)
              });
                      
              if (landUpdateResponse.ok) {
                console.log(`Successfully updated land owner in backend for ${transaction.asset_id}`);
              } else {
                throw new Error(`Failed with status: ${landUpdateResponse.status}`);
              }
            } catch (updateOwnerError) {
              console.warn(`Failed to update land owner via update-owner endpoint: ${updateOwnerError}`);
                      
              // Try the regular land endpoint as a fallback
              try {
                const landCreateResponse = await fetch(`${apiBaseUrl}/api/land`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ 
                    land_id: transaction.asset_id,
                    user: ownerToSet, // Username
                    wallet_address: buyer, // Wallet address
                    historical_name: transaction.historical_name,
                    english_name: transaction.english_name,
                    description: transaction.description
                  }),
                  signal: AbortSignal.timeout(10000)
                });
                        
                if (landCreateResponse.ok) {
                  console.log(`Successfully created/updated land record in backend for ${transaction.asset_id}`);
                } else {
                  throw new Error(`Failed with status: ${landCreateResponse.status}`);
                }
              } catch (createLandError) {
                console.error(`Failed to create/update land record: ${createLandError}`);
                
                // Try one more approach - direct API call
                try {
                  const directApiResponse = await fetch(`${apiBaseUrl}/api/direct-land-update`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      land_id: transaction.asset_id,
                      owner: ownerToSet,
                      wallet: buyer
                    }),
                    signal: AbortSignal.timeout(10000)
                  });
                  
                  if (directApiResponse.ok) {
                    console.log(`Successfully updated land owner via direct API for ${transaction.asset_id}`);
                  } else {
                    throw new Error(`Failed with status: ${directApiResponse.status}`);
                  }
                } catch (directApiError) {
                  console.error(`All attempts to update land ownership in backend failed: ${directApiError}`);
                }
                        
                // Try one more approach - direct API call
                try {
                  const directApiResponse = await fetch(`${apiBaseUrl}/api/direct-land-update`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      land_id: transaction.asset_id,
                      owner: ownerToSet,
                      wallet: buyer
                    }),
                    signal: AbortSignal.timeout(10000)
                  });
                          
                  if (directApiResponse.ok) {
                    console.log(`Successfully updated land owner via direct API for ${transaction.asset_id}`);
                  } else {
                    throw new Error(`Failed with status: ${directApiResponse.status}`);
                  }
                } catch (directApiError) {
                  console.error(`All attempts to update land ownership in backend failed: ${directApiError}`);
                }
              }
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
                
        // Try to create the land record in the backend even if local file doesn't exist
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const landCreateResponse = await fetch(`${apiBaseUrl}/api/land`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              land_id: transaction.asset_id,
              user: ownerToSet,
              wallet_address: buyer,
              historical_name: transaction.historical_name,
              english_name: transaction.english_name,
              description: transaction.description
            }),
            signal: AbortSignal.timeout(10000)
          });
                  
          if (landCreateResponse.ok) {
            console.log(`Successfully created land record in backend for ${transaction.asset_id} even though local file doesn't exist`);
          }
        } catch (createError) {
          console.error(`Failed to create land record in backend: ${createError}`);
        }
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
