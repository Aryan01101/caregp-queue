"""Webhook endpoints for email and WhatsApp."""

import logging
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Form, HTTPException, Request
from pydantic import BaseModel

from src.services.database import get_database
from src.services.email import get_email_service
from src.services.llm import get_llm_service

logger = logging.getLogger(__name__)
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
    4. Extract intent and draft reply using Claude
    5. Store draft in database
    6. Return success (WhatsApp notification will be handled by LangGraph)

    Returns:
        Dict[str, Any]: Webhook response
    """
    try:
        # Parse form data from SendGrid
        form = await request.form()
        form_data = {key: value for key, value in form.items()}

        logger.info(f"Received email webhook from {form_data.get('from', 'unknown')}")

        # Get services
        email_service = get_email_service()
        llm_service = get_llm_service()
        db = get_database()

        # Parse email payload
        parsed_email = email_service.parse_sendgrid_payload(form_data)

        # Extract clean reply content
        reply_content = email_service.extract_reply_content(parsed_email["text_body"])

        # Find or create thread
        thread = None

        # Try to find existing thread by Message-ID (exact match for trailing emails)
        if parsed_email["message_id"]:
            thread = await db.get_thread_by_message_id(parsed_email["message_id"])

        # Try to find by References (reply to existing thread)
        if not thread and parsed_email["references"]:
            thread = await db.get_thread_by_references(parsed_email["references"])

        # Try to find by In-Reply-To
        if not thread and parsed_email["in_reply_to"]:
            thread = await db.get_thread_by_message_id(parsed_email["in_reply_to"])

        # Create new thread if not found
        if not thread:
            logger.info(f"Creating new thread for {parsed_email['from_email']}")
            thread = await db.create_thread(
                customer_email=parsed_email["from_email"],
                subject=parsed_email["subject"],
                message_id=parsed_email["message_id"],
                in_reply_to=parsed_email["in_reply_to"],
                references=parsed_email["references"],
            )
        else:
            logger.info(f"Found existing thread {thread['id']}")

            # Trailing email edge case: mark pending drafts as stale
            stale_count = await db.mark_drafts_stale(UUID(thread["id"]))
            if stale_count > 0:
                logger.info(f"Marked {stale_count} pending drafts as stale")

        # Extract intent using Claude
        logger.info("Extracting intent from email")
        intent_result = await llm_service.extract_intent(
            email_body=reply_content,
            subject=parsed_email["subject"],
        )

        if not intent_result["success"]:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract intent: {intent_result.get('error')}",
            )

        intent_data = intent_result["intent"]
        intent_confidence = intent_data.get("confidence", 0.5)

        # Draft reply using Claude
        logger.info("Drafting reply with Claude")
        draft_result = await llm_service.draft_reply(
            email_body=reply_content,
            subject=parsed_email["subject"],
            intent_data=intent_data,
        )

        if not draft_result["success"]:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to draft reply: {draft_result.get('error')}",
            )

        draft_data = draft_result["draft"]
        draft_confidence = draft_data["confidence"]

        # Calculate overall confidence
        confidence_score = llm_service.calculate_confidence_score(
            intent_confidence=intent_confidence,
            draft_confidence=draft_confidence,
            has_previous_context=bool(thread),
        )

        # Get latest draft to determine version number
        latest_draft = await db.get_latest_draft(UUID(thread["id"]))
        version_number = (latest_draft["version_number"] + 1) if latest_draft else 1

        # Store draft in database
        logger.info(f"Storing draft version {version_number} with confidence {confidence_score}")
        draft_record = await db.create_draft(
            thread_id=UUID(thread["id"]),
            version_number=version_number,
            content=draft_data["content"],
            confidence_score=confidence_score,
        )

        # Log event
        await db.log_event(
            event_type="email_received",
            actor="system",
            details={
                "from": parsed_email["from_email"],
                "subject": parsed_email["subject"],
                "intent": intent_data,
                "confidence": confidence_score,
            },
            thread_id=UUID(thread["id"]),
            draft_id=UUID(draft_record["id"]),
        )

        logger.info(f"Email processed successfully. Thread: {thread['id']}, Draft: {draft_record['id']}")

        return {
            "success": True,
            "thread_id": thread["id"],
            "draft_id": draft_record["id"],
            "version": version_number,
            "confidence": confidence_score,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email webhook error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process email: {str(e)}",
        )


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
