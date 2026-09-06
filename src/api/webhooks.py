"""Webhook endpoints for email and WhatsApp."""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


# =============================================================================
# Email Webhook (SendGrid Inbound Parse)
# =============================================================================


class EmailWebhookPayload(BaseModel):
    """SendGrid inbound email webhook payload."""

    from_email: str
    subject: str
    text: str
    html: str | None = None
    headers: str | None = None


@router.post("/email")
async def email_webhook(request: Request) -> Dict[str, Any]:
    """
    Receive inbound emails from SendGrid Inbound Parse webhook.

    SendGrid sends multipart/form-data, so we need to parse it differently.

    Flow:
    1. Parse email from SendGrid payload
    2. Extract Message-ID, In-Reply-To, References headers
    3. Find or create thread
    4. Trigger LangGraph state machine
    5. Return success

    Returns:
        Dict[str, Any]: Webhook response
    """
    # TODO: Implement email webhook handler
    # - Parse SendGrid multipart/form-data
    # - Extract headers and email content
    # - Call LangGraph orchestration
    return {
        "success": True,
        "message": "Email webhook received (implementation pending)",
    }


# =============================================================================
# WhatsApp Webhook (Twilio)
# =============================================================================


class WhatsAppMessage(BaseModel):
    """Twilio WhatsApp incoming message."""

    From: str  # Format: whatsapp:+1234567890
    To: str
    Body: str
    MessageSid: str
    # For reply-to-quote disambiguation
    Context: Dict[str, str] | None = None


@router.post("/whatsapp")
async def whatsapp_webhook(message: WhatsAppMessage) -> Dict[str, Any]:
    """
    Receive incoming WhatsApp messages from Twilio.

    Flow:
    1. Extract WhatsApp message details
    2. Check if it's a reply-to-quote (Context field contains original message SID)
    3. Find draft by WhatsApp SID
    4. Parse action (approve/feedback/reject)
    5. Resume LangGraph execution
    6. Return TwiML response

    Returns:
        Dict[str, Any]: Webhook response
    """
    # TODO: Implement WhatsApp webhook handler
    # - Parse Twilio WhatsApp message
    # - Handle reply-to-quote disambiguation
    # - Resume LangGraph from checkpoint
    return {
        "success": True,
        "message": "WhatsApp webhook received (implementation pending)",
    }


@router.get("/whatsapp")
async def whatsapp_webhook_info() -> Dict[str, str]:
    """
    WhatsApp webhook information endpoint.

    Returns:
        Dict[str, str]: Endpoint documentation
    """
    return {
        "endpoint": "/webhooks/whatsapp",
        "method": "POST",
        "description": "Twilio WhatsApp webhook for receiving reviewer responses",
        "expected_fields": "From, To, Body, MessageSid, Context (for reply-to-quote)",
    }
