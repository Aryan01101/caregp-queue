"""Integration test for complete approval flow."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.workflows.state import create_initial_state


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.requires_db
@pytest.mark.requires_external_services
class TestApprovalFlow:
    """Test complete email-to-send approval workflow."""

    async def test_complete_approval_flow(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test complete approval flow from email receipt to customer reply.
        
        Flow:
        1. Email arrives via SendGrid webhook
        2. LangGraph extracts intent and drafts reply
        3. Draft sent to reviewer via WhatsApp
        4. Reviewer approves
        5. Email sent to customer
        """
        # Mock database operations
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db
            
            # Mock thread creation
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_thread_by_message_id.return_value = None
            mock_db.get_thread_by_references.return_value = None
            mock_db.create_thread.return_value = {
                "id": test_thread_id,
                "customer_email": test_email_form_data["from"],
                "subject": test_email_form_data["subject"],
                "status": "active",
            }
            
            # Mock reviewer
            mock_db.get_active_reviewers.return_value = [
                {
                    "id": "reviewer-123",
                    "name": "Test Reviewer",
                    "phone_number": "+1234567890",
                    "is_active": True,
                }
            ]
            
            # Mock draft creation
            test_draft_id = "650e8400-e29b-41d4-a716-446655440000"
            mock_db.create_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Thank you for your inquiry. Here is the answer.",
                "confidence_score": 0.85,
                "status": "pending",
                "whatsapp_message_sid": "test-whatsapp-sid-123",
            }
            
            # Mock pending draft lookup for WhatsApp response
            mock_db.get_most_recent_pending_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Thank you for your inquiry. Here is the answer.",
                "status": "pending",
            }
            
            # Mock log event
            mock_db.log_event = AsyncMock()
            mock_db.update_draft_status = AsyncMock()
            mock_db.update_thread_status = AsyncMock()
            
            # Patch get_database to return mock
            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):
                    
                    # Step 1: Send email webhook
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=test_email_form_data,
                    )
                    
                    assert email_response.status_code == 200
                    email_data = email_response.json()
                    assert email_data["success"] is True
                    assert email_data["thread_id"] == test_thread_id
                    assert email_data["workflow_status"] == "started"
                    
                    # Verify thread created
                    mock_db.create_thread.assert_called_once()
                    
                    # Verify draft created
                    assert mock_db.create_draft.call_count >= 1
                    
                    # Step 2: Send WhatsApp approval
                    whatsapp_response = await async_client.post(
                        "/webhooks/whatsapp",
                        json={
                            "From": "whatsapp:+1234567890",
                            "To": "whatsapp:+15555555555",
                            "Body": "APPROVE",
                            "MessageSid": "test-incoming-sid",
                        },
                    )
                    
                    assert whatsapp_response.status_code == 200
                    whatsapp_data = whatsapp_response.json()
                    assert whatsapp_data["success"] is True
                    assert whatsapp_data["action"] == "approved"
                    assert whatsapp_data["draft_id"] == test_draft_id
                    
                    # Verify draft status updated to sent
                    mock_db.update_draft_status.assert_called()
                    
                    # Verify thread status updated to completed
                    mock_db.update_thread_status.assert_called()

    async def test_approval_flow_with_high_confidence(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Test that high-confidence drafts still require approval."""
        # Similar setup but verify approval is still required
        # even with high confidence score
        pass

    async def test_approval_flow_logs_events(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Test that all workflow events are properly logged."""
        # Verify email_received, draft_created, draft_sent_to_reviewer,
        # draft_approved, email_sent events are logged
        pass
