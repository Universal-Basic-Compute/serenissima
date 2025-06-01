import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_request_loan_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the request_loan chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the financial institution or lender (no action needed)
    2. submit_loan_application_form - Process the loan application and handle any fees
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for {activity_type}: {e}")
        return False
    
    # Handle goto_location activity (first step in chain)
    if activity_type == "goto_location" and details.get("activityType") == "request_loan":
        # No need to create the submit_loan_application_form activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location for requesting a loan of {details.get('amount')} Ducats.")
        log.info(f"The submit_loan_application_form activity should already be scheduled to start after this activity.")
        return True
    
    # Handle submit_loan_application_form activity (second step in chain)
    elif activity_type == "submit_loan_application_form":
        return _process_loan_application(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in request_loan processor: {activity_type}")
        return False

def _process_loan_application(
    tables: Dict[str, Any],
    loan_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Process the loan application when the submit_loan_application_form activity is executed."""
    fields = loan_activity.get('fields', {})
    citizen = fields.get('Citizen')
    amount = details.get('amount')
    purpose = details.get('purpose', 'Unspecified')
    collateral_details = details.get('collateralDetails', {})
    lender_username = details.get('lenderUsername')
    
    if not (citizen and amount):
        log.error(f"Missing data for loan application: citizen={citizen}, amount={amount}")
        return False
    
    # Get the financial institution where the application is being filed
    filing_building_id = fields.get('FromBuilding')
    filing_building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if filing_building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(filing_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            filing_building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {filing_building_operator} for building {filing_building_id}")
    
    # Calculate application fee (0.5% of loan amount, minimum 10 Ducats)
    # Based on average daily wage of 2000 Ducats
    application_fee = max(10, amount * 0.005)
    
    # Check if citizen has enough Ducats to pay the application fee
    citizen_formula = f"{{Username}}='{_escape_airtable_value(citizen)}'"
    citizen_records = tables["citizens"].all(formula=citizen_formula, max_records=1)
    
    if not citizen_records:
        log.error(f"Citizen {citizen} not found for loan application")
        return False
        
    citizen_record = citizen_records[0]
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < application_fee:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to pay application fee of {application_fee} Ducats")
        return False
    
    try:
        # 1. Deduct application fee from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - application_fee})
        
        # 2. Add application fee to financial institution operator
        if filing_building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(filing_building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + application_fee})
        
        # 3. Record the application fee transaction
        transaction_fields = {
            "Type": "loan_application_fee",
            "AssetType": "loan_application",
            "Asset": f"loan_application_{citizen}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "Seller": citizen,  # Citizen pays
            "Buyer": filing_building_operator,  # Financial institution operator receives
            "Price": application_fee,
            "Notes": json.dumps({
                "loan_amount": amount,
                "purpose": purpose,
                "filing_building_id": filing_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # 4. Create a loan record in the LOANS table
        loan_id = f"loan_{citizen}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        # Determine the lender - either the specified lender or the financial institution operator
        effective_lender = lender_username if lender_username else filing_building_operator
        
        # Default loan terms
        interest_rate = 0.05  # 5% interest rate
        term_days = 30  # 30-day term
        
        loan_fields = {
            "LoanId": loan_id,
            "Name": f"Loan of {amount} Ducats to {citizen}",
            "Lender": effective_lender,
            "Borrower": citizen,
            "Type": "personal" if not collateral_details else "secured",
            "Status": "pending_approval",  # Initial status
            "PrincipalAmount": amount,
            "InterestRate": interest_rate,
            "TermDays": term_days,
            "RemainingBalance": amount,  # Initially equal to principal
            "ApplicationText": purpose,
            "LoanPurpose": purpose,
            "Notes": json.dumps(collateral_details) if collateral_details else "",
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        # Create the loan record
        tables["loans"].create(loan_fields)
        
        # 5. Notify the lender about the loan application
        if effective_lender != "ConsiglioDeiDieci":
            notification_fields = {
                "Citizen": effective_lender,
                "Type": "loan_application_received",
                "Content": f"Citizen {citizen} has applied for a loan of {amount} Ducats for: {purpose}",
                "Details": json.dumps({
                    "loanId": loan_id,
                    "amount": amount,
                    "purpose": purpose,
                    "borrower": citizen
                }),
                "Asset": loan_id,
                "AssetType": "loan",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully processed loan application for {citizen}: {amount} Ducats for {purpose}")
        log.info(f"Collected application fee of {application_fee} Ducats from {citizen} paid to {filing_building_operator}")
        log.info(f"Created loan record with ID: {loan_id}, status: pending_approval")
        
        return True
    except Exception as e:
        log.error(f"Failed to process loan application: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
