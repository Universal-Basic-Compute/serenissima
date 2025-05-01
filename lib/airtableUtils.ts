export async function transferComputeInAirtable(walletAddress: string, amount: number) {
  try {
    // We're working with whole tokens in the UI, so we send the amount as is to Airtable
    // The blockchain transaction in tokenUtils.ts will handle the decimal conversion
    console.log(`Transferring ${amount.toLocaleString()} COMPUTE for wallet ${walletAddress}`);
    
    const response = await fetch('http://localhost:8000/api/transfer-compute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount, // Send the whole token amount as entered by the user
      }),
    });
    
    if (!response.ok) {
      let errorMessage = 'Failed to transfer compute';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        // If we can't parse the error response, just use the status text
        errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error transferring compute in Airtable:', error);
    throw error;
  }
}
