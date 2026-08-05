import logging
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional

import requests

from backend.engine.utils.activity_helpers import (
    LogColors,
    VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

# Inference request statuses (mirrors PROCESSES statuses)
INFERENCE_STATUS_PENDING = "pending"
INFERENCE_STATUS_IN_PROGRESS = "in_progress"
INFERENCE_STATUS_COMPLETED = "completed"
INFERENCE_STATUS_FAILED = "failed"

# Airtable long-text fields reject content beyond ~100k characters
_TEXT_FIELD_MAX_CHARS = 95000


def _truncate_for_airtable(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    if len(text) <= _TEXT_FIELD_MAX_CHARS:
        return text
    return text[:_TEXT_FIELD_MAX_CHARS] + "\n\n[... truncated for Airtable field size limit ...]"


def create_inference_request(
    tables: Dict[str, Any],
    citizen_username: str,
    request_type: str,
    kinos_url: str,
    payload: Dict[str, Any],
    process_id: Optional[str] = None
) -> Optional[str]:
    """
    Materializes an inference request in the INFERENCE_REQUESTS table before it is sent.

    The exact prompt ("message") and system prompt ("addSystem") from the KinOS payload
    are stored so the queue is fully auditable.

    Returns:
        The Airtable record id of the created request, or None if recording failed.
    """
    request_id = f"inference-{uuid.uuid4().hex[:12]}"

    record_payload = {
        "RequestId": request_id,
        "Citizen": citizen_username,
        "Type": request_type,
        "Status": INFERENCE_STATUS_IN_PROGRESS,
        "Model": payload.get("model", ""),
        "KinosUrl": kinos_url,
        "Prompt": _truncate_for_airtable(payload.get("message", "")),
        "SystemPrompt": _truncate_for_airtable(payload.get("addSystem", "")),
        "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
    }
    if process_id:
        record_payload["ProcessId"] = process_id

    try:
        record = tables['inference_requests'].create(record_payload)
        log.info(f"{LogColors.OKBLUE}Materialized inference request {request_id} ({request_type}) for {citizen_username}{LogColors.ENDC}")
        return record['id']
    except Exception as e:
        # Recording must not block the inference itself: the thinking pipeline was
        # functional before this table existed and must keep working if Airtable hiccups.
        log.error(f"{LogColors.FAIL}Failed to materialize inference request {request_id} for {citizen_username}: {e}{LogColors.ENDC}")
        return None


def _update_inference_request(
    tables: Dict[str, Any],
    record_id: Optional[str],
    status: str,
    http_status: Optional[int] = None,
    response_text: Optional[str] = None,
    error: Optional[str] = None,
    duration_seconds: Optional[float] = None
) -> None:
    if not record_id:
        return

    update_payload: Dict[str, Any] = {
        "Status": status,
        "CompletedAt": datetime.now(VENICE_TIMEZONE).isoformat()
    }
    if http_status is not None:
        update_payload["HttpStatus"] = http_status
    if response_text is not None:
        update_payload["Response"] = _truncate_for_airtable(response_text)
    if error is not None:
        update_payload["Error"] = _truncate_for_airtable(error)
    if duration_seconds is not None:
        update_payload["DurationSeconds"] = round(duration_seconds, 1)

    try:
        tables['inference_requests'].update(record_id, update_payload)
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to update inference request {record_id} to status '{status}': {e}{LogColors.ENDC}")


def execute_kinos_inference(
    tables: Dict[str, Any],
    citizen_username: str,
    request_type: str,
    kinos_url: str,
    payload: Dict[str, Any],
    timeout: int,
    process_id: Optional[str] = None
) -> requests.Response:
    """
    Sends an inference request to KinOS, materialized in the INFERENCE_REQUESTS table.

    Drop-in replacement for `requests.post(kinos_url, json=payload, timeout=timeout)`:
    returns the same Response object and re-raises the same request exceptions, so
    existing error handling in callers keeps working unchanged.
    """
    record_id = create_inference_request(
        tables=tables,
        citizen_username=citizen_username,
        request_type=request_type,
        kinos_url=kinos_url,
        payload=payload,
        process_id=process_id
    )

    start_time = time.monotonic()
    try:
        response = requests.post(kinos_url, json=payload, timeout=timeout)
    except requests.exceptions.RequestException as e:
        _update_inference_request(
            tables, record_id,
            status=INFERENCE_STATUS_FAILED,
            error=str(e),
            duration_seconds=time.monotonic() - start_time
        )
        raise

    duration = time.monotonic() - start_time

    if response.ok:
        response_text = response.text
        try:
            # Store only the generated content when the payload is standard KinOS JSON
            response_content = response.json().get('response')
            if response_content:
                response_text = response_content
        except ValueError:
            pass
        _update_inference_request(
            tables, record_id,
            status=INFERENCE_STATUS_COMPLETED,
            http_status=response.status_code,
            response_text=response_text,
            duration_seconds=duration
        )
    else:
        _update_inference_request(
            tables, record_id,
            status=INFERENCE_STATUS_FAILED,
            http_status=response.status_code,
            error=response.text[:2000],
            duration_seconds=duration
        )

    return response
