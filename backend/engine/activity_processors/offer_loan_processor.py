import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_offer_loan_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the offer_loan chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the financial institution or notary office (no action needed)
    2. register_loan_offer_terms - Process the loan offer registration and handle any fees
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
    if activity_type == "goto_location" and details.get("activityType") == "offer_loan":
        # No need to create the register_loan_offer_terms activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location for registering a loan offer of {details.get('amount')} Ducats.")
        log.info(f"The register_loan_offer_terms activity should already be scheduled to start after this activity.")
        return True
    
    # Handle register_loan_offer_terms activity (second step in chain)
    elif activity_type == "register_loan_offer_terms":
        return _process_loan_offer_registration(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in offer_loan processor: {activity_type}")
        return False

def _process_loan_offer_registration(
    tables: Dict[str, Any],
    loan_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Process the loan offer registration when the register_loan_offer_terms activity is executed."""
    fields = loan_activity.get('fields', {})
    citizen = fields.get('Citizen')
    amount = details.get('amount')
    interest_rate = details.get('interestRate')
    term_days = details.get('termDays')
    target_borrower_username = details.get('targetBorrowerUsername')
    
    if not (citizen and amount and interest_rate is not None and term_days is not None):
        log.error(f"Missing data for loan offer registration: citizen={citizen}, amount={amount}, interest_rate={interest_rate}, term_days={term_days}")
        return False
    
    # Get the financial institution where the offer is being registered
    filing_building_id = fields.get('FromBuilding')
    filing_building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if filing_building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(filing_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            filing_building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {filing_building_operator} for building {filing_building_id}")
    
    # Calculate registration fee (0.5% of loan amount, minimum 10 Ducats)
    # Based on average daily wage of 2000 Ducats
    registration_fee = max(10, amount * 0.005)
    
    # Check if citizen has enough Ducats to pay the registration fee
    citizen_formula = f"{{Username}}='{_escape_airtable_value(citizen)}'"
    citizen_records = tables["citizens"].all(formula=citizen_formula, max_records=1)
    
    if not citizen_records:
        log.error(f"Citizen {citizen} not found for loan offer registration")
        return False
        
    citizen_record = citizen_records[0]
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < registration_fee:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to pay registration fee of {registration_fee} Ducats")
        return False
    
    # If a specific borrower is targeted, verify they exist
    if target_borrower_username:
        borrower_formula = f"{{Username}}='{_escape_airtable_value(target_borrower_username)}'"
        borrower_records = tables["citizens"].all(formula=borrower_formula, max_records=1)
        
        if not borrower_records:
            log.error(f"Target borrower {target_borrower_username} not found")
            return False
    
    try:
        # 1. Deduct registration fee from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - registration_fee})
        
        # 2. Add registration fee to financial institution operator
        if filing_building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(filing_building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + registration_fee})
        
        # 3. Record the registration fee transaction
        transaction_fields = {
            "Type": "loan_offer_registration_fee",
            "AssetType": "loan_offer",
            "Asset": f"loan_offer_{citizen}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "Seller": citizen,  # Citizen pays
            "Buyer": filing_building_operator,  # Financial institution operator receives
            "Price": registration_fee,
            "Notes": json.dumps({
                "loan_amount": amount,
                "interest_rate": interest_rate,
                "term_days": term_days,
                "target_borrower": target_borrower_username,
                "filing_building_id": filing_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # 4. Create a loan record in the LOANS table with status "offered"
        loan_id = f"loan_offer_{citizen}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        loan_fields = {
            "LoanId": loan_id,
            "Name": f"Loan offer of {amount} Ducats from {citizen}" + (f" to {target_borrower_username}" if target_borrower_username else ""),
            "Lender": citizen,
            "Borrower": target_borrower_username if target_borrower_username else None,
            "Type": "personal",  # Default to personal loan
            "Status": "offered",  # Initial status for loan offers
            "PrincipalAmount": amount,
            "InterestRate": interest_rate,
            "TermDays": term_days,
            "RemainingBalance": amount,  # Initially equal to principal
            "LoanPurpose": "Loan offer",
            "Notes": json.dumps({
                "registration_fee": registration_fee,
                "filing_building_id": filing_building_id,
                "is_public_offer": target_borrower_username is None
            }),
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        # Create the loan record
        tables["loans"].create(loan_fields)
        
        # 5. Notify the target borrower if specified
        if target_borrower_username:
            notification_fields = {
                "Citizen": target_borrower_username,
                "Type": "loan_offer_received",
                "Content": f"Citizen {citizen} has offered you a loan of {amount} Ducats at {interest_rate*100}% interest for {term_days} days.",
                "Details": json.dumps({
                    "loanId": loan_id,
                    "amount": amount,
                    "interestRate": interest_rate,
                    "termDays": term_days,
                    "lender": citizen
                }),
                "Asset": loan_id,
                "AssetType": "loan",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully processed loan offer registration for {citizen}: {amount} Ducats at {interest_rate*100}% interest for {term_days} days")
        log.info(f"Collected registration fee of {registration_fee} Ducats from {citizen} paid to {filing_building_operator}")
        log.info(f"Created loan offer record with ID: {loan_id}, status: offered")
        
        return True
    except Exception as e:
        log.error(f"Failed to process loan offer registration: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
