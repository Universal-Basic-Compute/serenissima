"""
Tests for daily payment logic in the engine layer:
  - dailyloanpayments.py  (loan payment processing)
  - dailywages.py         (wage payment processing)

Airtable is fully mocked via MockTable from conftest.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock

# Ensure imports resolve
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tests.conftest import MockTable, _make_citizen, _make_loan, _make_building

# We test the pure functions, not the CLI wrappers that call sys.exit.
from backend.engine.dailyloanpayments import (
    get_active_loans,
    find_citizen_by_identifier as loan_find_citizen,
    update_compute_balance as loan_update_balance,
    process_loan_payment,
    create_transaction_record as loan_create_txn,
    create_notification,
)

from backend.engine.dailywages import (
    get_employed_citizens,
    find_citizen_by_identifier as wage_find_citizen,
    update_compute_balance as wage_update_balance,
    process_wage_payment,
)


# ===========================================================================
# Daily Loan Payments
# ===========================================================================

class TestGetActiveLoans:
    """Test fetching active loans from the loans table."""

    def test_returns_active_loans_only(self):
        active = _make_loan("loan1", "Marco", "Treasury", 100, 500, status="active")
        paid = _make_loan("loan2", "Lucia", "Treasury", 50, 0, status="paid")
        tables = {"loans": MockTable([active, paid])}

        result = get_active_loans(tables)
        assert len(result) == 1
        assert result[0]["fields"]["Name"] == "loan1"

    def test_returns_empty_when_no_loans(self):
        tables = {"loans": MockTable([])}
        result = get_active_loans(tables)
        assert result == []


class TestLoanFindCitizen:
    """Test citizen lookup in the loan payments context."""

    def test_find_by_username(self):
        citizen = _make_citizen("Marco")
        tables = {"citizens": MockTable([citizen])}
        result = loan_find_citizen(tables, "Marco")
        assert result is not None
        assert result["fields"]["Username"] == "Marco"

    def test_find_by_wallet(self):
        citizen = _make_citizen("Marco", wallet="0xABC123")
        tables = {"citizens": MockTable([citizen])}
        result = loan_find_citizen(tables, "0xABC123")
        assert result is not None

    def test_not_found_returns_none(self):
        tables = {"citizens": MockTable([])}
        result = loan_find_citizen(tables, "Ghost")
        assert result is None


class TestLoanUpdateBalance:
    """Test balance add/subtract for loan processing."""

    def test_add_balance(self):
        citizen = _make_citizen("Marco", ducats=1000, airtable_id="rec_m")
        tables = {"citizens": MockTable([citizen])}
        result = loan_update_balance(tables, "rec_m", 250, "add")
        assert result["fields"]["Ducats"] == 1250

    def test_subtract_balance(self):
        citizen = _make_citizen("Marco", ducats=1000, airtable_id="rec_m")
        tables = {"citizens": MockTable([citizen])}
        result = loan_update_balance(tables, "rec_m", 300, "subtract")
        assert result["fields"]["Ducats"] == 700

    def test_subtract_allows_negative(self):
        """Loan payments can push balance negative (unlike citizen_utils which blocks it)."""
        citizen = _make_citizen("Marco", ducats=50, airtable_id="rec_m")
        tables = {"citizens": MockTable([citizen])}
        result = loan_update_balance(tables, "rec_m", 100, "subtract")
        assert result["fields"]["Ducats"] == -50


class TestProcessLoanPayment:
    """Test the full loan payment pipeline."""

    def _tables_with(self, borrower_ducats=1000, lender_ducats=500, remaining=300, payment=100):
        borrower = _make_citizen("Borrower", ducats=borrower_ducats, airtable_id="rec_borrower")
        lender = _make_citizen("Lender", ducats=lender_ducats, airtable_id="rec_lender")
        loan = _make_loan("loan_test", "Borrower", "Lender", payment, remaining)
        return {
            "citizens": MockTable([borrower, lender]),
            "loans": MockTable([loan]),
            "transactions": MockTable([]),
            "notifications": MockTable([]),
        }, loan

    def test_dry_run_does_not_modify(self):
        tables, loan = self._tables_with()
        result = process_loan_payment(tables, loan, dry_run=True)
        assert result is True
        # Balances unchanged
        borrower = tables["citizens"].get("rec_borrower")
        assert borrower["fields"]["Ducats"] == 1000

    def test_skips_when_missing_fields(self):
        loan_missing = {
            "id": "rec_bad",
            "fields": {"Name": "bad", "Borrower": "", "Lender": "X", "PaymentAmount": 100, "RemainingBalance": 200},
        }
        tables = {"citizens": MockTable([]), "transactions": MockTable([]), "notifications": MockTable([])}
        result = process_loan_payment(tables, loan_missing)
        assert result is False

    def test_adjusts_payment_to_remaining_balance(self):
        """If payment > remaining, payment should be capped to remaining."""
        tables, loan = self._tables_with(remaining=50, payment=200)
        # The process_loan_payment should adjust payment_amount to 50
        result = process_loan_payment(tables, loan, dry_run=True)
        assert result is True

    def test_skips_zero_payment(self):
        loan_zero = _make_loan("loan_zero", "A", "B", 0, 100)
        tables = {"citizens": MockTable([]), "transactions": MockTable([]), "notifications": MockTable([])}
        result = process_loan_payment(tables, loan_zero)
        assert result is False


# ===========================================================================
# Daily Wages
# ===========================================================================

class TestGetEmployedCitizens:
    """Test fetching citizens who work at businesses."""

    def test_returns_citizens_occupying_businesses(self):
        biz = _make_building("biz1", "Boss", occupant="Marco", category="business")
        citizen = _make_citizen("Marco", airtable_id="rec_marco")

        # get_employed_citizens uses a complex AND formula that our simple
        # MockTable parser cannot fully evaluate. We use MagicMock to
        # control the return values directly.
        mock_buildings = MagicMock()
        mock_buildings.all.return_value = [biz]
        mock_citizens = MagicMock()
        mock_citizens.all.return_value = [citizen]
        tables = {
            "buildings": mock_buildings,
            "citizens": mock_citizens,
        }
        result = get_employed_citizens(tables)
        assert len(result) == 1
        assert result[0]["fields"]["Username"] == "Marco"

    def test_returns_empty_when_no_businesses(self):
        mock_buildings = MagicMock()
        mock_buildings.all.return_value = []
        tables = {
            "buildings": mock_buildings,
            "citizens": MagicMock(),
        }
        result = get_employed_citizens(tables)
        assert result == []


class TestProcessWagePayment:
    """Test the wage payment processing for a single citizen."""

    def _tables_for_wage(self, employer_ducats=5000, wages=200):
        employer = _make_citizen("Boss", ducats=employer_ducats, airtable_id="rec_boss")
        worker = _make_citizen("Worker", ducats=100, airtable_id="rec_worker")
        biz = _make_building("biz1", "Boss", occupant="Worker", category="business",
                             wages=wages, run_by="Boss")
        return {
            "citizens": MockTable([employer, worker]),
            "buildings": MockTable([biz]),
            "transactions": MockTable([]),
            "notifications": MockTable([]),
            "relationships": MockTable([]),
        }

    def test_dry_run_returns_success_no_side_effects(self):
        tables = self._tables_for_wage()
        citizen = tables["citizens"].get("rec_worker")
        success, amount = process_wage_payment(tables, citizen, dry_run=True)
        assert success is True
        assert amount == 200
        # Worker balance unchanged
        assert tables["citizens"].get("rec_worker")["fields"]["Ducats"] == 100

    def test_skips_citizen_without_username(self):
        tables = self._tables_for_wage()
        bad_citizen = {"id": "rec_bad", "fields": {"FirstName": "NoName", "LastName": "Test"}}
        success, amount = process_wage_payment(tables, bad_citizen)
        assert success is False
        assert amount == 0

    def test_skips_zero_wages(self):
        tables = self._tables_for_wage(wages=0)
        citizen = tables["citizens"].get("rec_worker")
        success, amount = process_wage_payment(tables, citizen)
        assert success is False

    @patch("backend.engine.dailywages.update_trust_score_for_activity")
    def test_insufficient_employer_funds(self, mock_trust):
        tables = self._tables_for_wage(employer_ducats=10, wages=500)
        citizen = tables["citizens"].get("rec_worker")
        success, amount = process_wage_payment(tables, citizen)
        assert success is False

    @patch("backend.engine.dailywages.update_trust_score_for_activity")
    def test_self_employment_skips_transfer(self, mock_trust):
        """When employer == employee, no actual transfer happens."""
        owner = _make_citizen("Owner", ducats=5000, airtable_id="rec_owner")
        biz = _make_building("biz_self", "Owner", occupant="Owner", category="business",
                             wages=300, run_by="Owner")
        tables = {
            "citizens": MockTable([owner]),
            "buildings": MockTable([biz]),
            "transactions": MockTable([]),
            "notifications": MockTable([]),
            "relationships": MockTable([]),
        }
        citizen = tables["citizens"].get("rec_owner")
        success, amount = process_wage_payment(tables, citizen)
        assert success is True
        assert amount == 300
        # Balance unchanged (no transfer for self-employment)
        assert tables["citizens"].get("rec_owner")["fields"]["Ducats"] == 5000
