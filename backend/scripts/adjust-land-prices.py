#!/usr/bin/env python3
"""
Script to adjust all land transaction prices by dividing by a specified factor.
This is useful for bulk price adjustments in the database.

Usage:
    python adjust-land-prices.py <division_factor> [--dry-run]

Example:
    python adjust-land-prices.py 10  # Divides all land transaction prices by 10
    python adjust-land-prices.py 100 --dry-run  # Shows what would change without making changes
"""

import os
import sys
import argparse
import traceback
from dotenv import load_dotenv
from pyairtable import Api, Table
import json
from datetime import datetime

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

# Load environment variables
load_dotenv()

# Get Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_TRANSACTIONS_TABLE = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")

def initialize_airtable():
    """Initialize Airtable connection"""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        print("ERROR: Airtable credentials are not properly set in .env file")
        print("Please make sure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set")
        sys.exit(1)
    
    try:
        airtable = Api(AIRTABLE_API_KEY)
        transactions_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE)
        print(f"Initialized Airtable TRANSACTIONS table: {AIRTABLE_TRANSACTIONS_TABLE}")
        return transactions_table
    except Exception as e:
        print(f"ERROR initializing Airtable: {str(e)}")
        traceback.print_exc(file=sys.stdout)
        sys.exit(1)

def get_land_transactions(transactions_table):
    """Get all land transactions from Airtable"""
    try:
        # Get all transactions with Type = 'land'
        formula = "{Type}='land'"
        print(f"Fetching land transactions with formula: {formula}")
        records = transactions_table.all(formula=formula)
        print(f"Found {len(records)} land transactions")
        return records
    except Exception as e:
        print(f"ERROR fetching land transactions: {str(e)}")
        traceback.print_exc(file=sys.stdout)
        sys.exit(1)

def adjust_transaction_prices(transactions_table, records, division_factor, dry_run=False):
    """Adjust transaction prices by dividing by the specified factor"""
    if division_factor <= 0:
        print("ERROR: Division factor must be greater than 0")
        sys.exit(1)
    
    adjusted_count = 0
    error_count = 0
    skipped_count = 0
    
    print(f"{'DRY RUN: ' if dry_run else ''}Adjusting land transaction prices by dividing by {division_factor}")
    
    for record in records:
        try:
            record_id = record["id"]
            fields = record["fields"]
            
            # Skip records without a Price field
            if "Price" not in fields:
                print(f"Skipping record {record_id}: No Price field")
                skipped_count += 1
                continue
            
            current_price = fields["Price"]
            
            # Skip records with zero or negative price
            if current_price <= 0:
                print(f"Skipping record {record_id}: Price is {current_price}")
                skipped_count += 1
                continue
            
            # Calculate new price
            new_price = current_price / division_factor
            
            # Log the change
            print(f"Record {record_id}: Price {current_price} -> {new_price}")
            
            # Update the record if not a dry run
            if not dry_run:
                # Add a note about the adjustment
                notes = fields.get("Notes", "{}")
                try:
                    notes_data = json.loads(notes)
                except json.JSONDecodeError:
                    notes_data = {}
                
                # Add price adjustment info to notes
                notes_data["price_adjustment"] = {
                    "original_price": current_price,
                    "division_factor": division_factor,
                    "adjusted_price": new_price,
                    "adjusted_at": datetime.now().isoformat(),
                    "adjusted_by": "adjust-land-prices.py script"
                }
                
                # Update the record
                transactions_table.update(record_id, {
                    "Price": new_price,
                    "Notes": json.dumps(notes_data),
                    "UpdatedAt": datetime.now().isoformat()
                })
            
            adjusted_count += 1
            
        except Exception as e:
            print(f"ERROR adjusting record {record.get('id', 'unknown')}: {str(e)}")
            error_count += 1
    
    return adjusted_count, error_count, skipped_count

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Adjust land transaction prices by dividing by a specified factor")
    parser.add_argument("division_factor", type=float, help="Factor to divide prices by")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without making changes")
    args = parser.parse_args()
    
    print(f"Starting land transaction price adjustment script")
    print(f"Division factor: {args.division_factor}")
    print(f"Dry run: {args.dry_run}")
    
    # Initialize Airtable
    transactions_table = initialize_airtable()
    
    # Get land transactions
    records = get_land_transactions(transactions_table)
    
    # Confirm with citizen before proceeding
    if not args.dry_run:
        confirmation = input(f"This will adjust {len(records)} land transaction prices by dividing by {args.division_factor}. Continue? (y/n): ")
        if confirmation.lower() != 'y':
            print("Operation cancelled")
            sys.exit(0)
    
    # Adjust transaction prices
    adjusted_count, error_count, skipped_count = adjust_transaction_prices(
        transactions_table, records, args.division_factor, args.dry_run
    )
    
    # Print summary
    print("\nSummary:")
    print(f"Total records: {len(records)}")
    print(f"Adjusted: {adjusted_count}")
    print(f"Errors: {error_count}")
    print(f"Skipped: {skipped_count}")
    
    if args.dry_run:
        print("\nThis was a dry run. No changes were made.")
    else:
        print("\nPrice adjustment completed successfully.")

if __name__ == "__main__":
    main()
