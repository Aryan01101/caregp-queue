"""Integration tests for edge cases and error scenarios."""

import pytest
from unittest.mock import AsyncMock, patch
from uuid import UUID


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.requires_db
@pytest.mark.requires_external_services
class TestEdgeCases:
    """Test edge cases and error handling."""

    async def test_trailing_email_in_existing_thread(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test that a new email in an existing thread is handled correctly.

        Flow:
        1. First email creates thread and draft
        2. Customer sends follow-up email (trailing email)
        3. System should find existing thread by Message-ID/References
        4. New draft created in same thread
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock existing thread
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_thread_by_message_id.return_value = None
            mock_db.get_thread_by_references.return_value = {
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
                "version_number": 2,
                "content": "Thank you for the follow-up.",
                "confidence_score": 0.80,
                "status": "pending",
            }

            mock_db.log_event = AsyncMock()

            # Prepare trailing email with References header
            trailing_email_data = test_email_form_data.copy()
            trailing_email_data["headers"] = """Message-ID: <trailing-message-id@example.com>
From: customer@example.com
Subject: Re: Test inquiry
In-Reply-To: <test-message-id@example.com>
References: <test-message-id@example.com>"""
            trailing_email_data["text"] = "Following up on my previous email."

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send trailing email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=trailing_email_data,
                    )

                    assert email_response.status_code == 200
                    assert email_response.json()["success"] is True

                    # Verify thread lookup by references was called
                    mock_db.get_thread_by_references.assert_called()

                    # Verify new thread was NOT created
                    mock_db.create_thread.assert_not_called()

                    # Verify draft was created in existing thread
                    assert mock_db.create_draft.call_count >= 1

    async def test_no_pending_drafts_scenario(
        self,
        async_client,
        mock_all_services,
    ):
        """
        Test WhatsApp response when no pending drafts exist.

        Scenario: Reviewer sends APPROVE but there are no pending drafts.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock no pending drafts
            mock_db.get_most_recent_pending_draft.return_value = None

            # Mock reviewer
            mock_db.get_reviewer_by_phone.return_value = {
                "id": "reviewer-123",
                "name": "Test Reviewer",
                "phone_number": "+1234567890",
                "is_active": True,
            }

            mock_db.log_event = AsyncMock()

            with patch("src.api.webhooks.get_database", return_value=mock_db):

                # Send approval with no pending drafts
                whatsapp_response = await async_client.post(
                    "/webhooks/whatsapp",
                    json={
                        "From": "whatsapp:+1234567890",
                        "To": "whatsapp:+15555555555",
                        "Body": "APPROVE",
                        "MessageSid": "test-sid",
                    },
                )

                assert whatsapp_response.status_code == 200
                response_data = whatsapp_response.json()

                # Should return success: False with helpful message
                assert response_data["success"] is False
                assert "error" in response_data
                assert "No pending drafts" in response_data["error"]

    async def test_unknown_reviewer_handling(
        self,
        async_client,
        mock_all_services,
    ):
        """
        Test handling of WhatsApp message from unknown phone number.

        Scenario: Message comes from phone number not in reviewer database.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock unknown reviewer (not found)
            mock_db.get_reviewer_by_phone.return_value = None

            mock_db.log_event = AsyncMock()

            with patch("src.api.webhooks.get_database", return_value=mock_db):

                # Send message from unknown number
                whatsapp_response = await async_client.post(
                    "/webhooks/whatsapp",
                    json={
                        "From": "whatsapp:+9999999999",
                        "To": "whatsapp:+15555555555",
                        "Body": "APPROVE",
                        "MessageSid": "test-sid",
                    },
                )

                assert whatsapp_response.status_code == 200
                response_data = whatsapp_response.json()

                # Should return error about unauthorized reviewer
                assert response_data["success"] is False
                assert "error" in response_data

    async def test_thread_detection_by_message_id(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test thread detection using Message-ID header.

        Scenario: Email has In-Reply-To header matching existing Message-ID.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock existing thread found by Message-ID
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_thread_by_message_id.return_value = {
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
                "content": "Reply content",
                "confidence_score": 0.80,
                "status": "pending",
            }

            mock_db.log_event = AsyncMock()

            # Email with In-Reply-To header
            reply_email_data = test_email_form_data.copy()
            reply_email_data["headers"] = """Message-ID: <new-message-id@example.com>
From: customer@example.com
Subject: Re: Test inquiry
In-Reply-To: <test-message-id@example.com>"""

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send reply email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=reply_email_data,
                    )

                    assert email_response.status_code == 200

                    # Verify thread lookup by Message-ID was called
                    mock_db.get_thread_by_message_id.assert_called()

                    # Verify new thread was NOT created
                    mock_db.create_thread.assert_not_called()

    async def test_unknown_whatsapp_action(
        self,
        async_client,
        mock_all_services,
    ):
        """
        Test handling of unknown WhatsApp commands.

        Scenario: Reviewer sends unrecognized command.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock reviewer
            mock_db.get_reviewer_by_phone.return_value = {
                "id": "reviewer-123",
                "name": "Test Reviewer",
                "phone_number": "+1234567890",
                "is_active": True,
            }

            # Mock pending draft
            test_draft_id = "650e8400-e29b-41d4-a716-446655440000"
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_most_recent_pending_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Draft content",
                "status": "pending",
            }

            mock_db.log_event = AsyncMock()

            with patch("src.api.webhooks.get_database", return_value=mock_db):

                # Send unknown command
                whatsapp_response = await async_client.post(
                    "/webhooks/whatsapp",
                    json={
                        "From": "whatsapp:+1234567890",
                        "To": "whatsapp:+15555555555",
                        "Body": "UNKNOWN_COMMAND",
                        "MessageSid": "test-sid",
                    },
                )

                assert whatsapp_response.status_code == 200
                response_data = whatsapp_response.json()

                # Should handle gracefully with help message
                assert response_data["success"] is True
                assert response_data["action"] == "help"

    async def test_empty_email_body(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test handling of email with empty body.

        Scenario: Email arrives with no text content.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock thread creation
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

            mock_db.log_event = AsyncMock()

            # Email with empty body
            empty_email_data = test_email_form_data.copy()
            empty_email_data["text"] = ""

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send email with empty body
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=empty_email_data,
                    )

                    # Should still process (might use subject as content)
                    assert email_response.status_code == 200

    async def test_very_long_email_content(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test handling of very long email content.

        Scenario: Email with extremely long body (potential token limits).
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock thread creation
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

            mock_db.log_event = AsyncMock()

            # Email with very long body (10000 characters)
            long_email_data = test_email_form_data.copy()
            long_email_data["text"] = "This is a very long email. " * 400  # ~10k chars

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send long email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=long_email_data,
                    )

                    # Should handle gracefully
                    assert email_response.status_code == 200

    async def test_multiple_references_in_header(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test thread detection with multiple References.

        Scenario: Email has multiple message IDs in References header.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock existing thread found by references
            test_thread_id = "550e8400-e29b-41d4-a716-446655440000"
            mock_db.get_thread_by_message_id.return_value = None
            mock_db.get_thread_by_references.return_value = {
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

            mock_db.log_event = AsyncMock()

            # Email with multiple References
            multi_ref_email_data = test_email_form_data.copy()
            multi_ref_email_data["headers"] = """Message-ID: <new-message-id@example.com>
From: customer@example.com
Subject: Re: Test inquiry
References: <ref1@example.com> <ref2@example.com> <test-message-id@example.com>"""

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send email with multiple references
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=multi_ref_email_data,
                    )

                    assert email_response.status_code == 200

                    # Verify thread lookup was attempted
                    mock_db.get_thread_by_references.assert_called()

    async def test_malformed_email_headers(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test handling of malformed email headers.

        Scenario: Email headers are missing or incorrectly formatted.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock thread creation
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

            mock_db.log_event = AsyncMock()

            # Email with malformed headers
            malformed_email_data = test_email_form_data.copy()
            malformed_email_data["headers"] = "InvalidHeaderFormat"

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send email with malformed headers
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=malformed_email_data,
                    )

                    # Should handle gracefully and create new thread
                    assert email_response.status_code == 200

    async def test_confidence_score_edge_cases(
        self,
        async_client,
        test_email_form_data,
        mock_all_services,
    ):
        """
        Test handling of extreme confidence scores.

        Scenario: Test behavior with very high and very low confidence.
        """
        with patch("src.services.database.DatabaseService") as mock_db_class:
            mock_db = AsyncMock()
            mock_db_class.return_value = mock_db

            # Mock thread creation
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

            # Mock draft with very low confidence
            test_draft_id = "650e8400-e29b-41d4-a716-446655440000"
            mock_db.create_draft.return_value = {
                "id": test_draft_id,
                "thread_id": test_thread_id,
                "version_number": 1,
                "content": "Draft content",
                "confidence_score": 0.10,  # Very low confidence
                "status": "pending",
            }

            mock_db.log_event = AsyncMock()

            with patch("src.api.webhooks.get_database", return_value=mock_db):
                with patch("src.workflows.graph.get_database", return_value=mock_db):

                    # Send email
                    email_response = await async_client.post(
                        "/webhooks/email",
                        data=test_email_form_data,
                    )

                    # Should still send to reviewer even with low confidence
                    assert email_response.status_code == 200
