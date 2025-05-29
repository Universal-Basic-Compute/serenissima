# Wallet Storage Backend

This is a Python FastAPI backend for storing wallet addresses and compute investments in Airtable.

## Setup

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Create a `.env` file with your Airtable credentials:
   ```
   AIRTABLE_API_KEY=your_airtable_api_key
   AIRTABLE_BASE_ID=your_airtable_base_id
   AIRTABLE_CITIZENS_TABLE=Citizens
   ```

3. Run the server:
   ```
   python run.py
   ```

The server will start at http://localhost:8000

## API Endpoints

- `GET /`: Check if the API is running
- `POST /api/wallet`: Store a wallet address
- `GET /api/wallet/{wallet_address}`: Get wallet information
- `POST /api/invest-compute`: Invest compute resources for a wallet
- `POST /api/land`: Create a land record
- `GET /api/land/{land_id}`: Get land information
- `GET /api/lands`: Get all lands with their owners
- `POST /api/transaction`: Create a transaction record
- `GET /api/transaction/land/{land_id}`: Get transaction for a specific land
- `GET /api/transactions`: Get all active transactions
- `POST /api/transaction/{transaction_id}/execute`: Execute a transaction

## Airtable Structure

The Citizens table should have the following fields:
- Wallet (text): The wallet address
- Ducats (number): The amount of compute resources invested
- Username (text): The citizen's username
- Email (text): The citizen's email address

The LANDS table should have the following fields:
- LandId (text): The ID of the land (polygon)
- Wallet (text): The wallet address of the owner
- HistoricalName (text): The historical name of the land
- EnglishName (text): The English translation of the historical name
- Description (text): A description of the land

The TRANSACTIONS table should have the following fields:
- Type (text): The type of transaction (land, bridge, etc.)
- Asset (text): The ID of the asset being transacted
- Seller (text): The seller's wallet address or name
- Buyer (text): The buyer's wallet address (can be empty for listings)
- Price (number): The price of the asset
- HistoricalName (text): The historical name of the asset
- EnglishName (text): The English translation of the name
- Description (text): A description of the asset
- CreatedAt (text): When the transaction was created
- UpdatedAt (text): When the transaction was last updated
- ExecutedAt (text): When the transaction was executed (empty for active listings)
