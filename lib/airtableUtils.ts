export async function transferComputeInAirtable(walletAddress: string, amount: number) {
  try {
    // Ensure we're sending the full amount without any conversion
    console.log(`Transferring ${amount.toLocaleString()} COMPUTE for wallet ${walletAddress}`);
    
    const response = await fetch('http://localhost:8000/api/transfer-compute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount, // Send the full amount as entered by the user
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to transfer compute');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error transferring compute in Airtable:', error);
    throw error;
  }
}
