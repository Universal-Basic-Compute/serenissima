"""
Shared fixtures for La Serenissima test suite.

Provides mock Airtable tables and common test data so that tests
never hit real external services.
"""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure project root is on sys.path for backend imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ---------------------------------------------------------------------------
# Common citizen record factories
# ---------------------------------------------------------------------------

def _make_citizen(username, ducats=1000, wallet=None, citizen_id=None, airtable_id=None, **extra_fields):
    """Build a fake Airtable citizen record."""
    fields = {
        "Username": username,
        "Ducats": ducats,
        "Wallet": wallet or f"0x{username.lower()[:8]}",
        "CitizenId": citizen_id or f"cit_{username.lower()}",
        "FirstName": username,
        "LastName": "TestCitizen",
    }
    fields.update(extra_fields)
    return {
        "id": airtable_id or f"rec_{username.lower()}",
        "fields": fields,
    }


def _make_building(building_id, owner, occupant=None, category="business",
                   rent_price=0, wages=0, run_by=None, **extra_fields):
    """Build a fake Airtable building record."""
    fields = {
        "BuildingId": building_id,
        "Owner": owner,
        "Occupant": occupant or "",
        "Category": category,
        "RentPrice": rent_price,
        "Wages": wages,
        "RunBy": run_by or owner,
    }
    fields.update(extra_fields)
    return {
        "id": f"rec_{building_id}",
        "fields": fields,
    }


def _make_loan(loan_id, borrower, lender, payment_amount, remaining_balance, status="active"):
    """Build a fake Airtable loan record."""
    return {
        "id": f"rec_{loan_id}",
        "fields": {
            "Name": loan_id,
            "Borrower": borrower,
            "Lender": lender,
            "PaymentAmount": payment_amount,
            "RemainingBalance": remaining_balance,
            "Status": status,
        },
    }


# ---------------------------------------------------------------------------
# Mock Airtable table
# ---------------------------------------------------------------------------

class MockTable:
    """
    Minimal mock of pyairtable.Table that stores records in memory.
    Supports all(), get(), create(), update() with optional formula filtering.
    """

    def __init__(self, records=None):
        self._records = list(records or [])
        self._next_id = 1000

    def all(self, formula=None, max_records=None, **kwargs):
        results = list(self._records)
        # Very basic formula filtering — supports simple equality checks
        if formula:
            results = self._apply_formula(results, formula)
        if max_records:
            results = results[:max_records]
        return results

    def get(self, record_id):
        for rec in self._records:
            if rec["id"] == record_id:
                return rec
        return None

    def create(self, fields):
        record = {"id": f"rec_auto_{self._next_id}", "fields": dict(fields)}
        self._next_id += 1
        self._records.append(record)
        return record

    def update(self, record_id, fields):
        for rec in self._records:
            if rec["id"] == record_id:
                rec["fields"].update(fields)
                return rec
        return None

    # ------------------------------------------------------------------
    def _apply_formula(self, records, formula):
        """Extremely simplified formula evaluator for tests.

        Handles:
          {Field}='value'
          AND(...)  — treated as pass-through (returns all)
          OR(...)   — treated as pass-through (returns all)

        For full coverage we just do substring matching on simple equalities.
        """
        import re
        # Try to extract simple {Field}='Value' pairs
        pairs = re.findall(r"\{(\w+)\}\s*=\s*'([^']*)'", formula)
        if not pairs:
            return records

        filtered = []
        for rec in records:
            # For OR: match any pair; for AND or bare: match all pairs
            is_or = formula.strip().upper().startswith("OR(")
            matches = [
                str(rec["fields"].get(field, "")).lower() == value.lower()
                for field, value in pairs
            ]
            if is_or and any(matches):
                filtered.append(rec)
            elif not is_or and all(matches):
                filtered.append(rec)
        return filtered


@pytest.fixture
def make_citizen():
    """Factory fixture to build citizen records."""
    return _make_citizen


@pytest.fixture
def make_building():
    """Factory fixture to build building records."""
    return _make_building


@pytest.fixture
def make_loan():
    """Factory fixture to build loan records."""
    return _make_loan


@pytest.fixture
def mock_table():
    """Factory fixture to create a MockTable pre-loaded with records."""
    def _factory(records=None):
        return MockTable(records)
    return _factory
