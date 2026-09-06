"""Integration test for redraft workflow with feedback."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.requires_db
@pytest.mark.requires_external_services
class TestRedraftFlow:
    """Test redraft workflow when reviewer provides feedback."""

    async def test_complete_redraft_flow(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test complete redraft flow with feedback.
        
        Flow:
        1. Email arrives and draft v1 created
        2. Draft sent to reviewer
        3. Reviewer provides feedback
        4. System creates draft v2 with feedback incorporated
        5. Draft v2 sent to reviewer
        6. Reviewer approves v2
        7. Email sent to customer
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
            
            # Mock draft v1
            draft_v1_id = "650e8400-e29b-41d4-a716-446655440001"
            mock_db.create_draft.return_value = {
                "id": draft_v1_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Thank you for your inquiry.",
                "confidence_score": 0.75,
                "status": "pending",
            }
            
            # Mock pending draft lookup (first returns v1, then v2)
            draft_v2_id = "650e8400-e29b-41d4-a716-446655440002"
            mock_db.get_most_recent_pending_draft.side_effect = [
                {
                    "id": draft_v1_id,
                    "thread_id": test_thread_id,
                    "version_number": 1,
                    "content": "Thank you for your inquiry.",
                    "status": "pending",
                },
                {
                    "id": draft_v2_id,
                    "thread_id": test_thread_id,
                    "version_number": 2,
                    "content": "Thank you for your inquiry. Regarding our refund policy...",
                    "status": "pending",
                },
            ]
            
            # Mock feedback history for redraft
            mock_db.get_feedback_history.return_value = [
                {"feedback_text": "Please mention the refund policy"}
            ]
            
            mock_db.log_event = AsyncMock()
            mock_db.update_draft_status = AsyncMock()
            mock_db.update_thread_status = AsyncMock()
            
            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):
                    
                    # Step 1: Send initial email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=test_email_form_data,
                    )
                    
                    assert email_response.status_code == 200
                    assert email_response.json()["success"] is True
                    
                    # Step 2: Send feedback
                    feedback_response = await async_client.post(
                        "/webhooks/whatsapp",
                        json={
                            "From": "whatsapp:+1234567890",
                            "To": "whatsapp:+15555555555",
                            "Body": "FEEDBACK: Please mention the refund policy",
                            "MessageSid": "test-sid-1",
                        },
                    )
                    
                    assert feedback_response.status_code == 200
                    feedback_data = feedback_response.json()
                    assert feedback_data["success"] is True
                    assert feedback_data["action"] == "feedback"
                    assert feedback_data["new_version"] == 2
                    assert feedback_data["old_draft_id"] == draft_v1_id
                    
                    # Verify old draft marked as rejected
                    mock_db.update_draft_status.assert_called_with(
                        draft_v1_id, "rejected"
                    )
                    
                    # Step 3: Approve new draft
                    approval_response = await async_client.post(
                        "/webhooks/whatsapp",
                        json={
                            "From": "whatsapp:+1234567890",
                            "To": "whatsapp:+15555555555",
                            "Body": "APPROVE",
                            "MessageSid": "test-sid-2",
                        },
                    )
                    
                    assert approval_response.status_code == 200
                    approval_data = approval_response.json()
                    assert approval_data["success"] is True
                    assert approval_data["action"] == "approved"

    async def test_multiple_redraft_iterations(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Test multiple rounds of feedback and redrafts."""
        # Test v1 -> feedback -> v2 -> feedback -> v3 -> approve
        pass

    async def test_redraft_incorporates_feedback(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Verify feedback is actually incorporated in redraft."""
        # Mock LLM to verify feedback is passed in prompt
        pass

    async def test_redraft_version_number_increments(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """Verify version numbers increment correctly."""
        # Test that version_number goes 1 -> 2 -> 3, etc.
        pass
