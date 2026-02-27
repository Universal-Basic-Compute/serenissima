"""
Tests for backend/engine/main_engine.py — activity dispatcher and AI decision engine.

Heavy external dependencies (Airtable, handler modules, activity creators) are
mocked so we can focus on the routing / priority logic in isolation.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

# Ensure imports resolve
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.main_engine import (
    dispatch_specific_activity_request_original,
    process_citizen_activity,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _citizen_record(username="Marco", custom_id="cit_marco", airtable_id="rec_marco", **extra):
    fields = {
        "Username": username,
        "CitizenId": custom_id,
        "CustomId": custom_id,
        "FirstName": username,
        "LastName": "Test",
        "Ducats": 1000,
        "IsEngagedInBlockingActivity": False,
    }
    fields.update(extra)
    return {"id": airtable_id, "fields": fields}


# ---------------------------------------------------------------------------
# dispatch_specific_activity_request (the original, unwrapped version)
# ---------------------------------------------------------------------------

class TestDispatchSpecificActivityRequest:
    """Tests for the API-driven activity dispatcher."""

    def _base_kwargs(self, citizen=None, activity_type="send_message", params=None):
        return dict(
            tables=MagicMock(),
            citizen_record=citizen or _citizen_record(),
            activity_type=activity_type,
            activity_parameters=params or {},
            resource_defs={},
            building_type_defs={},
            transport_api_url="http://transport",
            api_base_url="http://api",
        )

    def test_unknown_activity_type_returns_failure(self):
        result = dispatch_specific_activity_request_original(
            **self._base_kwargs(activity_type="fly_to_moon")
        )
        assert result["success"] is False
        assert result["reason"] == "unknown_activity_type"

    @patch("backend.engine.main_engine.try_create_send_message_chain")
    def test_send_message_missing_recipient(self, mock_send):
        result = dispatch_specific_activity_request_original(
            **self._base_kwargs(
                activity_type="send_message",
                params={"content": "hello"},
            )
        )
        assert result["success"] is False
        assert result["reason"] == "missing_recipient"
        mock_send.assert_not_called()

    @patch("backend.engine.main_engine.try_create_send_message_chain")
    def test_send_message_success(self, mock_send):
        mock_send.return_value = {"id": "rec_activity", "fields": {"Type": "send_message"}}

        result = dispatch_specific_activity_request_original(
            **self._base_kwargs(
                activity_type="send_message",
                params={"recipient": "Lucia", "content": "Ciao!"},
            )
        )
        assert result["success"] is True
        assert result["activity"] is not None
        mock_send.assert_called_once()

    @patch("backend.engine.main_engine.try_create_send_message_chain")
    def test_send_message_creation_failed(self, mock_send):
        mock_send.return_value = None

        result = dispatch_specific_activity_request_original(
            **self._base_kwargs(
                activity_type="send_message",
                params={"recipient": "Lucia"},
            )
        )
        assert result["success"] is False
        assert result["reason"] == "creation_failed"

    def test_diplomatic_email_unauthorized(self):
        """Only diplomatic_virtuoso can send diplomatic emails."""
        citizen = _citizen_record(username="Marco")
        result = dispatch_specific_activity_request_original(
            **self._base_kwargs(
                citizen=citizen,
                activity_type="send_diplomatic_email",
                params={"description": "{}"},
            )
        )
        assert result["success"] is False
        assert result["reason"] == "unauthorized"


# ---------------------------------------------------------------------------
# process_citizen_activity — priority-chain engine
# ---------------------------------------------------------------------------

class TestProcessCitizenActivity:
    """Tests for the autonomous AI decision engine."""

    def test_blocked_citizen_returns_none(self):
        """Citizens engaged in a blocking activity should get no new activity."""
        citizen = _citizen_record(IsEngagedInBlockingActivity=True)
        result = process_citizen_activity(
            tables=MagicMock(),
            citizen_record=citizen,
            now_utc_dt=datetime.now(timezone.utc),
            is_night=False,
            api_base_url="http://api",
            hf_api_token="tok",
        )
        assert result is None

    @patch("backend.engine.main_engine.try_create_idle_activity")
    @patch("backend.engine.main_engine.needs_handlers")
    @patch("backend.engine.main_engine.work_handlers")
    @patch("backend.engine.main_engine.leisure_handlers")
    @patch("backend.engine.main_engine.management_handlers")
    @patch("backend.engine.main_engine.special_handlers")
    def test_falls_through_to_idle(
        self, mock_special, mock_mgmt, mock_leisure, mock_work, mock_needs, mock_idle
    ):
        """When every handler returns None, the engine falls back to idle."""
        # Explicitly set every handler method referenced by the handler_chain
        # to return None with a __name__, since MagicMock auto-creates truthy children.
        _all_handlers = {
            mock_special: ["_handle_leave_venice", "_handle_forestieri_daytime_tasks"],
            mock_needs: [
                "_handle_eat_from_inventory", "_handle_eat_at_home_or_goto",
                "_handle_eat_at_tavern_or_goto", "_handle_night_shelter",
                "_handle_emergency_fishing",
            ],
            mock_mgmt: ["_handle_check_business_status", "_handle_manage_public_dock"],
            mock_work: [
                "_handle_deposit_full_inventory", "_handle_production_and_general_work_tasks",
                "_handle_professional_construction_work", "_handle_occupant_self_construction",
                "_handle_porter_tasks",
            ],
            mock_leisure: [
                "_handle_shopping_tasks", "_handle_attend_theater_performance",
                "_handle_drink_at_inn", "_handle_use_public_bath",
                "_handle_read_book", "_handle_send_leisure_message",
                "_handle_spread_rumor",
            ],
        }
        for mod, attrs in _all_handlers.items():
            for attr in attrs:
                handler = getattr(mod, attr)
                handler.return_value = None
                handler.__name__ = attr

        mock_idle.return_value = {"id": "rec_idle", "fields": {"Type": "idle"}}

        citizen = _citizen_record()
        result = process_citizen_activity(
            tables=MagicMock(),
            citizen_record=citizen,
            now_utc_dt=datetime.now(timezone.utc),
            is_night=False,
            api_base_url="http://api",
            hf_api_token="tok",
        )
        assert result is not None
        mock_idle.assert_called_once()

    @patch("backend.engine.main_engine.try_create_idle_activity")
    @patch("backend.engine.main_engine.needs_handlers")
    @patch("backend.engine.main_engine.work_handlers")
    @patch("backend.engine.main_engine.leisure_handlers")
    @patch("backend.engine.main_engine.management_handlers")
    @patch("backend.engine.main_engine.special_handlers")
    def test_first_matching_handler_wins(
        self, mock_special, mock_mgmt, mock_leisure, mock_work, mock_needs, mock_idle
    ):
        """The first handler that returns an activity should stop the chain."""
        eat_activity = {"id": "rec_eat", "fields": {"Type": "eat_from_inventory"}}

        # Set __name__ on all handler mocks so the log line in main_engine works
        for mod in [mock_special, mock_mgmt, mock_leisure, mock_work, mock_needs]:
            for attr in dir(mod):
                if attr.startswith("_handle_"):
                    handler = getattr(mod, attr)
                    handler.return_value = None
                    handler.__name__ = attr

        # Override: the leave_venice handler returns None, eat_from_inventory returns activity
        mock_special._handle_leave_venice.return_value = None
        mock_special._handle_leave_venice.__name__ = "_handle_leave_venice"
        mock_needs._handle_eat_from_inventory.return_value = eat_activity
        mock_needs._handle_eat_from_inventory.__name__ = "_handle_eat_from_inventory"

        citizen = _citizen_record()
        result = process_citizen_activity(
            tables=MagicMock(),
            citizen_record=citizen,
            now_utc_dt=datetime.now(timezone.utc),
            is_night=False,
            api_base_url="http://api",
            hf_api_token="tok",
        )
        assert result == eat_activity
        # Idle should NOT be called since a handler returned a result
        mock_idle.assert_not_called()
