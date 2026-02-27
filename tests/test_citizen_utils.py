"""
Tests for backend/app/citizen_utils.py — citizen lookup and balance operations.

All Airtable calls are replaced with MockTable from conftest.
"""

import os
import sys
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

# Ensure imports resolve
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.citizen_utils import (
    find_citizen_by_identifier,
    update_compute_balance,
    transfer_compute,
)
from tests.conftest import MockTable, _make_citizen


# ---------------------------------------------------------------------------
# find_citizen_by_identifier
# ---------------------------------------------------------------------------

class TestFindCitizenByIdentifier:
    """Tests for looking up citizens by wallet or username."""

    def test_find_by_username(self):
        citizen = _make_citizen("Marco", ducats=500, wallet="0xabc")
        table = MockTable([citizen])

        result = find_citizen_by_identifier(table, "Marco")
        assert result is not None
        assert result["fields"]["Username"] == "Marco"

    def test_find_by_username_case_insensitive(self):
        citizen = _make_citizen("Marco", ducats=500)
        table = MockTable([citizen])

        result = find_citizen_by_identifier(table, "marco")
        assert result is not None
        assert result["fields"]["Username"] == "Marco"

    def test_find_by_wallet(self):
        citizen = _make_citizen("Marco", wallet="0xDEADBEEF")
        table = MockTable([citizen])

        result = find_citizen_by_identifier(table, "0xdeadbeef")
        assert result is not None
        assert result["fields"]["Wallet"] == "0xDEADBEEF"

    def test_not_found_raises_404(self):
        table = MockTable([])

        with pytest.raises(HTTPException) as exc_info:
            find_citizen_by_identifier(table, "nobody")
        assert exc_info.value.status_code == 404

    def test_create_if_missing(self):
        table = MockTable([])

        result = find_citizen_by_identifier(table, "0xNEW_WALLET", create_if_missing=True)
        assert result is not None
        assert result["fields"]["Wallet"] == "0xNEW_WALLET"
        assert result["fields"]["Ducats"] == 0


# ---------------------------------------------------------------------------
# update_compute_balance
# ---------------------------------------------------------------------------

class TestUpdateComputeBalance:
    """Tests for adding/subtracting Ducats."""

    def test_add_balance(self):
        citizen = _make_citizen("Marco", ducats=100, airtable_id="rec_marco")
        table = MockTable([citizen])

        result = update_compute_balance(table, "rec_marco", 50, "add")
        assert result["fields"]["Ducats"] == 150

    def test_subtract_balance(self):
        citizen = _make_citizen("Marco", ducats=200, airtable_id="rec_marco")
        table = MockTable([citizen])

        result = update_compute_balance(table, "rec_marco", 80, "subtract")
        assert result["fields"]["Ducats"] == 120

    def test_subtract_insufficient_raises_400(self):
        citizen = _make_citizen("Marco", ducats=30, airtable_id="rec_marco")
        table = MockTable([citizen])

        with pytest.raises(HTTPException) as exc_info:
            update_compute_balance(table, "rec_marco", 100, "subtract")
        assert exc_info.value.status_code == 400

    def test_invalid_operation_raises_400(self):
        citizen = _make_citizen("Marco", ducats=100, airtable_id="rec_marco")
        table = MockTable([citizen])

        with pytest.raises(HTTPException) as exc_info:
            update_compute_balance(table, "rec_marco", 10, "multiply")
        assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# transfer_compute
# ---------------------------------------------------------------------------

class TestTransferCompute:
    """Tests for citizen-to-citizen Ducat transfers."""

    def test_successful_transfer(self):
        sender = _make_citizen("Marco", ducats=500, airtable_id="rec_marco")
        receiver = _make_citizen("Lucia", ducats=200, airtable_id="rec_lucia")
        table = MockTable([sender, receiver])

        from_rec, to_rec = transfer_compute(table, "Marco", "Lucia", 100)
        assert from_rec["fields"]["Ducats"] == 400
        assert to_rec["fields"]["Ducats"] == 300

    def test_transfer_insufficient_funds(self):
        sender = _make_citizen("Marco", ducats=10, airtable_id="rec_marco")
        receiver = _make_citizen("Lucia", ducats=200, airtable_id="rec_lucia")
        table = MockTable([sender, receiver])

        with pytest.raises(HTTPException) as exc_info:
            transfer_compute(table, "Marco", "Lucia", 500)
        assert exc_info.value.status_code == 400
