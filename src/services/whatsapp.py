"""WhatsApp service for sending notifications via Twilio."""

import logging
from typing import Dict, Optional

from twilio.rest import Client

from src.core.config import get_settings

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for sending WhatsApp messages via Twilio."""

    def __init__(self) -> None:
        """Initialize WhatsApp service with Twilio client."""
        settings = get_settings()
        self.client = Client(
            settings.twilio_account_sid,
            settings.twilio_auth_token,
        )
        self.whatsapp_number = settings.twilio_whatsapp_number

    # =========================================================================
    # Send Draft for Review
    # =========================================================================

    async def send_draft_for_review(
        self,
        reviewer_phone: str,
        customer_email: str,
        subject: str,
        draft_content: str,
        confidence_score: float,
        thread_id: str,
        draft_id: str,
    ) -> Dict[str, any]:
        """
        Send draft to reviewer via WhatsApp for approval.

        Message format:
        ---
        New email from: customer@example.com
        Subject: Question about product

        Draft reply:
        [draft content]

        Confidence: 85%

        Reply with:
        - APPROVE to send
        - FEEDBACK: [your suggestions]
        - REJECT to discard
        ---

        Args:
            reviewer_phone: Reviewer WhatsApp number (format: +1234567890)
            customer_email: Customer email address
            subject: Email subject
            draft_content: Draft reply content
            confidence_score: AI confidence (0.0-1.0)
            thread_id: Thread UUID for tracking
            draft_id: Draft UUID for tracking

        Returns:
            Dict with send status and message SID
        """
        try:
            # Format confidence as percentage
            confidence_pct = int(confidence_score * 100)

            # Build message
            message_body = f"""📧 New email from: {customer_email}
Subject: {subject}

📝 Draft reply:
{draft_content}

🤖 Confidence: {confidence_pct}%

Reply:
• APPROVE - Send this reply
• FEEDBACK: [your suggestions] - Request changes
• REJECT - Discard and handle manually

Thread: {thread_id[:8]}..."""

            # Send WhatsApp message
            # Use quote/reply feature so we can track which draft this is
            message = self.client.messages.create(
                from_=self.whatsapp_number,
                to=f"whatsapp:{reviewer_phone}",
                body=message_body,
            )

            logger.info(
                f"Draft sent to {reviewer_phone} via WhatsApp. SID: {message.sid}"
            )

            return {
                "success": True,
                "message_sid": message.sid,
                "status": message.status,
            }

        except Exception as e:
            logger.error(f"Failed to send WhatsApp message: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }

    # =========================================================================
    # Parse Reviewer Response
    # =========================================================================

    def parse_reviewer_response(
        self, response_text: str
    ) -> Dict[str, any]:
        """
        Parse reviewer's WhatsApp response.

        Expected formats:
        - "APPROVE"
        - "FEEDBACK: Please mention the refund policy"
        - "REJECT"

        Args:
            response_text: WhatsApp message body from reviewer

        Returns:
            Dict with action and optional feedback text
        """
        response_lower = response_text.strip().lower()

        # Check for APPROVE
        if response_lower.startswith("approve"):
            return {
                "action": "approve",
                "feedback": None,
            }

        # Check for REJECT
        if response_lower.startswith("reject"):
            return {
                "action": "reject",
                "feedback": None,
            }

        # Check for FEEDBACK
        if response_lower.startswith("feedback"):
            # Extract feedback text after "FEEDBACK:"
            feedback_text = response_text.strip()
            if ":" in feedback_text:
                feedback_text = feedback_text.split(":", 1)[1].strip()

            return {
                "action": "feedback",
                "feedback": feedback_text,
            }

        # Unknown response
        logger.warning(f"Unknown reviewer response: {response_text}")
        return {
            "action": "unknown",
            "feedback": response_text,
        }

    # =========================================================================
    # Send Confirmation
    # =========================================================================

    async def send_confirmation(
        self,
        reviewer_phone: str,
        action: str,
        details: str | None = None,
    ) -> Dict[str, any]:
        """
        Send confirmation message to reviewer after processing their response.

        Args:
            reviewer_phone: Reviewer WhatsApp number
            action: Action taken (sent, redrafting, rejected)
            details: Optional details to include

        Returns:
            Dict with send status
        """
        try:
            # Build confirmation message based on action
            if action == "sent":
                message_body = "✅ Reply sent to customer!"
            elif action == "redrafting":
                message_body = f"🔄 Redrafting with your feedback:\n{details}"
            elif action == "rejected":
                message_body = "❌ Draft discarded. Handle manually."
            else:
                message_body = f"✓ Action: {action}"

            # Send confirmation
            message = self.client.messages.create(
                from_=self.whatsapp_number,
                to=f"whatsapp:{reviewer_phone}",
                body=message_body,
            )

            logger.info(f"Confirmation sent to {reviewer_phone}")

            return {
                "success": True,
                "message_sid": message.sid,
            }

        except Exception as e:
            logger.error(f"Failed to send confirmation: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }


# Singleton instance
_whatsapp_service: Optional[WhatsAppService] = None


def get_whatsapp_service() -> WhatsAppService:
    """Get or create WhatsApp service instance."""
    global _whatsapp_service
    if _whatsapp_service is None:
        _whatsapp_service = WhatsAppService()
    return _whatsapp_service
