"""
Utility functions for user operations to standardize user lookup and wallet handling.
"""
import traceback
import sys
from fastapi import HTTPException

def find_user_by_identifier(users_table, identifier, create_if_missing=False):
    """
    Find a user by wallet address or username (case-insensitive).
    
    Args:
        users_table: The Airtable users table
        identifier: The wallet address or username to search for
        create_if_missing: Whether to create a new user if not found
        
    Returns:
        The user record if found, or a new record if create_if_missing is True
        
    Raises:
        HTTPException: If user not found and create_if_missing is False
    """
    try:
        # Normalize the identifier to lowercase for case-insensitive comparison
        normalized_identifier = identifier.lower()
        
        # Get all users and find matching record
        all_users = users_table.all()
        matching_records = [
            record for record in all_users 
            if record["fields"].get("Wallet", "").lower() == normalized_identifier or
               record["fields"].get("Username", "").lower() == normalized_identifier
        ]
        
        if matching_records:
            return matching_records[0]
        
        if create_if_missing:
            # Create a new user record with the wallet address
            print(f"Creating new user record for {identifier}")
            record = users_table.create({
                "Wallet": identifier,
                "Ducats": 0
            })
            return record
        
        raise HTTPException(status_code=404, detail=f"User not found: {identifier}")
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error finding user: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

def update_compute_balance(users_table, user_id, amount, operation="add"):
    """
    Update a user's compute balance.
    
    Args:
        users_table: The Airtable users table
        user_id: The Airtable record ID of the user
        amount: The amount to add or subtract
        operation: "add" or "subtract"
        
    Returns:
        The updated user record
        
    Raises:
        HTTPException: If the operation fails
    """
    try:
        # Get the current record
        record = users_table.get(user_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"User record not found: {user_id}")
        
        current_amount = record["fields"].get("Ducats", 0)
        
        if operation == "add":
            new_amount = current_amount + amount
        elif operation == "subtract":
            if current_amount < amount:
                raise HTTPException(status_code=400, detail=f"Insufficient balance. Required: {amount}, Available: {current_amount}")
            new_amount = current_amount - amount
        else:
            raise HTTPException(status_code=400, detail=f"Invalid operation: {operation}")
        
        # Update the record
        updated_record = users_table.update(user_id, {
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

def transfer_compute(users_table, from_user, to_user, amount):
    """
    Transfer compute from one user to another.
    
    Args:
        users_table: The Airtable users table
        from_user: The wallet address or username of the sender
        to_user: The wallet address or username of the recipient
        amount: The amount to transfer
        
    Returns:
        A tuple of (from_record, to_record) with the updated records
        
    Raises:
        HTTPException: If the transfer fails
    """
    try:
        # Find the sender
        from_record = find_user_by_identifier(users_table, from_user)
        from_id = from_record["id"]
        
        # Find the recipient
        to_record = find_user_by_identifier(users_table, to_user, create_if_missing=True)
        to_id = to_record["id"]
        
        # Check if sender has enough compute
        from_amount = from_record["fields"].get("Ducats", 0)
        if from_amount < amount:
            raise HTTPException(status_code=400, detail=f"Insufficient balance. Required: {amount}, Available: {from_amount}")
        
        # Update sender's balance
        updated_from = update_compute_balance(users_table, from_id, amount, "subtract")
        
        # Update recipient's balance
        updated_to = update_compute_balance(users_table, to_id, amount, "add")
        
        return (updated_from, updated_to)
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error transferring compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)
