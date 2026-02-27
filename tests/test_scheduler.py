"""
Tests for backend/app/scheduler.py — task scheduling and notification logic.

These tests cover the helper functions (send_telegram_notification,
create_scheduler_problem) and the task-definition data structures without
actually running subprocesses or hitting external services.
"""

import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta, timezone

# Ensure imports resolve
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.scheduler import (
    send_telegram_notification,
    create_scheduler_problem,
    SCRIPTS_RESPECTING_FORCED_HOUR,
)


# ---------------------------------------------------------------------------
# SCRIPTS_RESPECTING_FORCED_HOUR sanity checks
# ---------------------------------------------------------------------------

class TestScriptsConfig:
    """Validate the module-level task configuration."""

    def test_forced_hour_scripts_is_a_list(self):
        assert isinstance(SCRIPTS_RESPECTING_FORCED_HOUR, list)

    def test_forced_hour_scripts_all_strings(self):
        for entry in SCRIPTS_RESPECTING_FORCED_HOUR:
            assert isinstance(entry, str), f"Expected str, got {type(entry)}: {entry}"

    def test_create_activities_in_forced_hour_list(self):
        assert "engine/createActivities.py" in SCRIPTS_RESPECTING_FORCED_HOUR

    def test_process_activities_in_forced_hour_list(self):
        assert "engine/processActivities.py" in SCRIPTS_RESPECTING_FORCED_HOUR


# ---------------------------------------------------------------------------
# send_telegram_notification
# ---------------------------------------------------------------------------

class TestSendTelegramNotification:
    """Test Telegram notification dispatch (mocking requests.post)."""

    @patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "test_token_123"})
    @patch("backend.app.scheduler.requests.post")
    def test_sends_message_with_correct_payload(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()

        send_telegram_notification("Test alert message")

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["chat_id"] == "1864364329"
        assert payload["text"] == "Test alert message"
        assert payload["parse_mode"] == "Markdown"

    @patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": ""})
    @patch("backend.app.scheduler.requests.post")
    def test_skips_when_no_bot_token(self, mock_post):
        send_telegram_notification("Should not send")
        mock_post.assert_not_called()

    @patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "tok"})
    @patch("backend.app.scheduler.requests.post")
    def test_truncates_long_messages(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()

        long_message = "x" * 5000
        send_telegram_notification(long_message)

        mock_post.assert_called_once()
        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        assert len(payload["text"]) <= 4200  # 4000 + buffer for truncation text


# ---------------------------------------------------------------------------
# create_scheduler_problem
# ---------------------------------------------------------------------------

class TestCreateSchedulerProblem:
    """Test Airtable problem creation (mocking pyairtable.Table)."""

    @patch.dict(os.environ, {"AIRTABLE_API_KEY": "key123", "AIRTABLE_BASE_ID": "app123"})
    @patch("backend.app.scheduler.Table")
    def test_creates_problem_record(self, MockTableClass):
        mock_table_instance = MagicMock()
        mock_table_instance.all.return_value = []  # No existing problems
        mock_table_instance.create.return_value = {"id": "rec_new"}
        MockTableClass.return_value = mock_table_instance

        result = create_scheduler_problem(
            "Test Task", "/path/to/script.py", "Return code 1", "some log output"
        )

        assert result is True
        mock_table_instance.create.assert_called_once()
        created_fields = mock_table_instance.create.call_args[0][0]
        assert created_fields["Type"] == "scheduler_task_failure"
        assert "Test Task" in created_fields["Title"]
        assert created_fields["Severity"] == "High"

    @patch.dict(os.environ, {"AIRTABLE_API_KEY": "key123", "AIRTABLE_BASE_ID": "app123"})
    @patch("backend.app.scheduler.Table")
    def test_skips_duplicate_problem(self, MockTableClass):
        mock_table_instance = MagicMock()
        mock_table_instance.all.return_value = [{"id": "rec_existing"}]  # Existing problem
        MockTableClass.return_value = mock_table_instance

        result = create_scheduler_problem(
            "Test Task", "/path/to/script.py", "Return code 1"
        )

        assert result is False
        mock_table_instance.create.assert_not_called()

    @patch.dict(os.environ, {"AIRTABLE_API_KEY": "", "AIRTABLE_BASE_ID": ""})
    def test_returns_false_without_credentials(self):
        result = create_scheduler_problem(
            "Test Task", "/path/to/script.py", "error"
        )
        assert result is False
