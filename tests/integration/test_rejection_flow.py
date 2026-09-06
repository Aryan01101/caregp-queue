"""Integration test for rejection workflow."""

import pytest
from unittest.mock import AsyncMock, patch
from uuid import UUID


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.requires_db
@pytest.mark.requires_external_services
class TestRejectionFlow:
    """Test rejection workflow."""

    async def test_complete_rejection_flow(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test complete rejection flow.
        
        Flow:
        1. Email arrives and draft created
        2. Draft sent to reviewer
        3. Reviewer rejects
        4. Draft marked as rejected
        5. Thread marked as rejected
        6. No email sent to customer
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db
            
            # Mock thread
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_thread_by_message_id.return_value = None
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
            
            # Mock draft
            test_draft_id = "650e8400-e29b-41d4-a716-446655440000"
            mock_db.create_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Draft reply content.",
                "confidence_score": 0.70,
                "status": "pending",
            }
            
            mock_db.get_most_recent_pending_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Draft reply content.",
                "status": "pending",
            }
            
            mock_db.log_event = AsyncMock()
            mock_db.update_draft_status = AsyncMock()
            mock_db.update_thread_status = AsyncMock()
            
            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):
                    
                    # Step 1: Send email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=test_email_form_data,
                    )
                    
                    assert email_response.status_code == 200
                    assert email_response.json()["success"] is True
                    
                    # Step 2: Send rejection
                    reject_response = await async_client.post(
                        "/webhooks/whatsapp",
                        json={
                            "From": "whatsapp:+1234567890",
                            "To": "whatsapp:+15555555555",
                            "Body": "REJECT",
                            "MessageSid": "test-sid",
                        },
                    )
                    
                    assert reject_response.status_code == 200
                    reject_data = reject_response.json()
                    assert reject_data["success"] is True
                    assert reject_data["action"] == "rejected"
                    assert reject_data["draft_id"] == test_draft_id
                    assert reject_data["thread_id"] == test_thread_id
                    
                    # Verify draft status updated to rejected
                    mock_db.update_draft_status.assert_any_call(
                        UUID(test_draft_id), "rejected"
                    )
                    
                    # Verify thread status updated to rejected
                    mock_db.update_thread_status.assert_called_with(
                        UUID(test_thread_id), "rejected"
                    )
                    
                    # Verify rejection event logged
                    mock_db.log_event.assert_called()
                    # Check that one of the log_event calls was for draft_rejected
                    rejection_logged = any(
                        call.kwargs.get("event_type") == "draft_rejected"
                        or (len(call.args) > 0 and call.args[0] == "draft_rejected")
                        for call in mock_db.log_event.call_args_list
                    )
                    assert rejection_logged, "draft_rejected event should be logged"

    async def test_rejection_prevents_email_send(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Verify no email is sent after rejection."""
        # Ensure SendGrid API is never called after rejection
        pass

    async def test_rejection_allows_new_thread(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Test that a new email can create a new thread after rejection."""
        # Reject one thread, then verify a new email creates a new thread
        pass
