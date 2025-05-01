export async function investComputeInAirtable(walletAddress: string, amount: number) {
  try {
    const response = await fetch('http://localhost:8000/api/invest-compute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        compute_amount: amount,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to invest compute');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error investing compute in Airtable:', error);
    throw error;
  }
}
