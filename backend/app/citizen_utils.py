"""
Utility functions for citizen operations to standardize citizen lookup and wallet handling.
"""
import traceback
import sys
from fastapi import HTTPException

def find_citizen_by_identifier(citizens_table, identifier, create_if_missing=False):
    """
    Find a citizen by wallet address or username (case-insensitive).
    
    Args:
        citizens_table: The Airtable citizens table
        identifier: The wallet address or username to search for
        create_if_missing: Whether to create a new citizen if not found
        
    Returns:
        The citizen record if found, or a new record if create_if_missing is True
        
    Raises:
        HTTPException: If citizen not found and create_if_missing is False
    """
    try:
        # Normalize the identifier to lowercase for case-insensitive comparison
        normalized_identifier = identifier.lower()
        
        # Get all citizens and find matching record
        all_citizens = citizens_table.all()
        matching_records = [
            record for record in all_citizens 
            if record["fields"].get("Wallet", "").lower() == normalized_identifier or
               record["fields"].get("Username", "").lower() == normalized_identifier
        ]
        
        if matching_records:
            return matching_records[0]
        
        if create_if_missing:
            # Create a new citizen record with the wallet address
            print(f"Creating new citizen record for {identifier}")
            record = citizens_table.create({
                "Wallet": identifier,
                "Ducats": 0
            })
            return record
        
        raise HTTPException(status_code=404, detail=f"Citizen not found: {identifier}")
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error finding citizen: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

def update_compute_balance(citizens_table, citizen_id, amount, operation="add"):
    """
    Update a citizen's compute balance.
    
    Args:
        citizens_table: The Airtable citizens table
        citizen_id: The Airtable record ID of the citizen
        amount: The amount to add or subtract
        operation: "add" or "subtract"
        
    Returns:
        The updated citizen record
        
    Raises:
        HTTPException: If the operation fails
    """
    try:
        # Get the current record
        record = citizens_table.get(citizen_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"Citizen record not found: {citizen_id}")
        
        current_price = record["fields"].get("Ducats", 0)
        
        if operation == "add":
            new_amount = current_price + amount
        elif operation == "subtract":
            if current_price < amount:
                raise HTTPException(status_code=400, detail=f"Insufficient balance. Required: {amount}, Available: {current_price}")
            new_amount = current_price - amount
        else:
            raise HTTPException(status_code=400, detail=f"Invalid operation: {operation}")
        
        # Update the record
        updated_record = citizens_table.update(citizen_id, {
            "Ducats": new_amount
        })
        
        return updated_record
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error updating compute balance: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

def transfer_compute(citizens_table, from_citizen, to_citizen, amount):
    """
    Transfer compute from one citizen to another.
    
    Args:
        citizens_table: The Airtable citizens table
        from_citizen: The wallet address or username of the sender
        to_citizen: The wallet address or username of the recipient
        amount: The amount to transfer
        
    Returns:
        A tuple of (from_record, to_record) with the updated records
        
    Raises:
        HTTPException: If the transfer fails
    """
    try:
        # Find the sender
        from_record = find_citizen_by_identifier(citizens_table, from_citizen)
        from_id = from_record["id"]
        
        # Find the recipient
        to_record = find_citizen_by_identifier(citizens_table, to_citizen, create_if_missing=True)
        to_id = to_record["id"]
        
        # Check if sender has enough compute
        from_amount = from_record["fields"].get("Ducats", 0)
        if from_amount < amount:
            raise HTTPException(status_code=400, detail=f"Insufficient balance. Required: {amount}, Available: {from_amount}")
        
        # Update sender's balance
        updated_from = update_compute_balance(citizens_table, from_id, amount, "subtract")
        
        # Update recipient's balance
        updated_to = update_compute_balance(citizens_table, to_id, amount, "add")
        
        return (updated_from, updated_to)
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error transferring compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)
