"""Tests for WhatsApp review notifications and replies."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workflows.graph import send_to_reviewer_node
from src.workflows.state import create_initial_state


@pytest.mark.unit
@pytest.mark.asyncio
async def test_send_to_reviewer_updates_the_existing_draft():
    """A WhatsApp SID must update the draft instead of creating a duplicate row."""
    state = create_initial_state(
        thread_id="550e8400-e29b-41d4-a716-446655440000",
        customer_email="customer@example.com",
        subject="Question",
        email_body="Can you help?",
        message_id="message@example.com",
    )
    state.update(
        draft_id="650e8400-e29b-41d4-a716-446655440000",
        draft_content="Yes, here is the answer.",
        overall_confidence=0.9,
    )

    database = MagicMock()
    database.get_active_reviewers = AsyncMock(
        return_value=[{"phone_number": "whatsapp:+15551234567"}]
    )
    database.update_draft_whatsapp_message_sid = AsyncMock()
    database.update_thread_status = AsyncMock()
    database.log_event = AsyncMock()
    database.create_draft = AsyncMock()

    whatsapp = MagicMock()
    whatsapp.send_draft_for_review = AsyncMock(
        return_value={"success": True, "message_sid": "SM123"}
    )

    with patch("src.workflows.graph.get_database", return_value=database), patch(
        "src.workflows.graph.get_whatsapp_service", return_value=whatsapp
    ):
        result = await send_to_reviewer_node(state)

    assert result["current_step"] == "await_review"
    whatsapp.send_draft_for_review.assert_awaited_once()
    assert whatsapp.send_draft_for_review.await_args.kwargs["reviewer_phone"] == "+15551234567"
    database.update_draft_whatsapp_message_sid.assert_awaited_once()
    database.create_draft.assert_not_awaited()
    database.update_thread_status.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_twilio_form_reply_uses_the_quoted_message_sid(async_client):
    """Twilio form payloads receive TwiML and map quote replies to the right draft."""
    database = MagicMock()
    database.get_active_reviewers = AsyncMock(
        return_value=[{"id": "reviewer-1", "name": "Reviewer", "phone_number": "+15551234567"}]
    )
    database.get_draft_by_whatsapp_sid = AsyncMock(
        return_value={
            "id": "650e8400-e29b-41d4-a716-446655440000",
            "thread_id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "pending",
        }
    )

    whatsapp = MagicMock()
    whatsapp.parse_reviewer_response.return_value = {"action": "approve"}
    whatsapp.send_confirmation = AsyncMock()
    graph = MagicMock()
    graph.ainvoke = AsyncMock(return_value={"current_step": "complete"})

    with patch("src.api.webhooks.get_database", return_value=database), patch(
        "src.api.webhooks.get_whatsapp_service", return_value=whatsapp
    ), patch("src.api.webhooks.get_workflow_graph", return_value=graph):
        response = await async_client.post(
            "/webhooks/whatsapp",
            data={
                "From": "whatsapp:+15551234567",
                "To": "whatsapp:+14155238886",
                "Body": "APPROVE",
                "MessageSid": "SMincoming",
                "OriginalRepliedMessageSid": "SMoutgoing",
            },
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    assert response.text == "<Response/>"
    database.get_draft_by_whatsapp_sid.assert_awaited_once_with("SMoutgoing")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_rejects_unsigned_twilio_forms(async_client, monkeypatch):
    """Public production endpoints must not accept forged reviewer commands."""
    from src.core.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()

    try:
        response = await async_client.post(
            "/webhooks/whatsapp",
            data={
                "From": "whatsapp:+15551234567",
                "To": "whatsapp:+14155238886",
                "Body": "APPROVE",
                "MessageSid": "SMincoming",
            },
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 403


@pytest.mark.unit
@pytest.mark.asyncio
async def test_readiness_checks_direct_postgres(async_client):
    """Readiness must exercise the direct connection used by LangGraph."""
    database = MagicMock()
    database.get_active_reviewers = AsyncMock(return_value=[])

    connection = MagicMock()
    cursor = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    with patch("src.api.health.get_database", return_value=database), patch(
        "src.api.health.psycopg.connect", return_value=connection
    ) as connect:
        response = await async_client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["database"] == "ready"
    connect.assert_called_once()
    cursor.execute.assert_called_once_with("SELECT 1")
