"""Webhook endpoints for email and WhatsApp."""

import logging
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Form, HTTPException, Request
from pydantic import BaseModel

from src.services.database import get_database
from src.services.email import get_email_service
from src.services.llm import get_llm_service
from src.services.whatsapp import get_whatsapp_service
from src.workflows.graph import get_workflow_graph
from src.workflows.state import create_initial_state, create_redraft_state

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
    4. Create initial state and invoke LangGraph workflow
    5. Workflow will extract intent, draft reply, and send to WhatsApp
    6. Return success (workflow continues in background via checkpoints)

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

        # Log event
        await db.log_event(
            event_type="email_received",
            actor="system",
            details={
                "from": parsed_email["from_email"],
                "subject": parsed_email["subject"],
            },
            thread_id=UUID(thread["id"]),
        )

        # Create initial workflow state
        initial_state = create_initial_state(
            thread_id=str(thread["id"]),
            customer_email=parsed_email["from_email"],
            subject=parsed_email["subject"],
            email_body=reply_content,
            message_id=parsed_email["message_id"],
            in_reply_to=parsed_email["in_reply_to"],
            references=parsed_email["references"],
        )

        # Get workflow graph
        graph = get_workflow_graph()

        # Invoke workflow (runs until first interrupt at "send_to_reviewer")
        config = {"configurable": {"thread_id": str(thread["id"])}}

        logger.info(f"Starting LangGraph workflow for thread {thread['id']}")
        result = await graph.ainvoke(initial_state, config)

        logger.info(f"Email processed successfully. Thread: {thread['id']}")

        return {
            "success": True,
            "thread_id": thread["id"],
            "workflow_status": "started",
            "current_step": result.get("current_step"),
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
    2. Parse reviewer response (APPROVE/FEEDBACK/REJECT)
    3. Find associated draft and thread
    4. Resume LangGraph workflow from checkpoint with reviewer action
    5. If FEEDBACK, create redraft state and restart workflow
    6. Return success

    Returns:
        Dict[str, Any]: Webhook response
    """
    try:
        logger.info(f"Received WhatsApp from {message.From}: {message.Body}")

        # Get services
        whatsapp_service = get_whatsapp_service()
        db = get_database()

        # Parse reviewer response
        parsed_response = whatsapp_service.parse_reviewer_response(message.Body)
        action = parsed_response["action"]
        feedback_text = parsed_response.get("feedback")

        if action == "unknown":
            # Send help message
            await whatsapp_service.send_confirmation(
                reviewer_phone=message.From.replace("whatsapp:", ""),
                action="help",
                details="Please reply with: APPROVE, FEEDBACK: [text], or REJECT",
            )
            return {"success": True, "message": "Unknown action, help sent"}

        # Find the most recent pending draft
        # In production, use Context field to find specific draft if reply-to-quote is available
        # For now, we'll find by most recent pending draft

        # Extract reviewer phone number
        reviewer_phone = message.From.replace("whatsapp:", "")

        # Get all active reviewers to find reviewer ID
        reviewers = await db.get_active_reviewers()
        reviewer = next((r for r in reviewers if r["phone_number"] == reviewer_phone), None)

        if not reviewer:
            logger.warning(f"Unknown reviewer: {reviewer_phone}")
            return {"success": False, "error": "Unknown reviewer"}

        # Find the draft this message is responding to
        # Strategy: Look for most recent pending draft for this reviewer
        # In production, could enhance with Twilio Context field for reply-to-quote
        draft = await db.get_most_recent_pending_draft()

        if not draft:
            logger.warning(f"No pending drafts found for reviewer response")
            await whatsapp_service.send_confirmation(
                reviewer_phone=reviewer_phone,
                action="help",
                details="No pending drafts found. All caught up!",
            )
            return {"success": False, "error": "No pending drafts"}

        logger.info(
            f"Reviewer {reviewer['name']} action: {action} on draft {draft['id']}"
        )

        # Get workflow graph
        graph = get_workflow_graph()
        config = {"configurable": {"thread_id": str(draft["thread_id"])}}

        # Process based on action
        if action == "approve":
            # Resume workflow with approval action
            logger.info(f"Approving draft {draft['id']}")

            # Update state with reviewer action
            updated_state = {
                "reviewer_action": "approve",
                "draft_id": str(draft["id"]),
            }

            # Resume workflow from checkpoint
            # This will trigger process_feedback_node → send_email_node
            result = await graph.ainvoke(updated_state, config)

            # Send confirmation
            await whatsapp_service.send_confirmation(
                reviewer_phone=reviewer_phone,
                action="sent",
            )

            return {
                "success": True,
                "action": "approved",
                "draft_id": draft["id"],
                "thread_id": draft["thread_id"],
                "workflow_status": result.get("current_step"),
            }

        elif action == "feedback":
            # Create redraft state and restart workflow
            logger.info(f"Requesting redraft for draft {draft['id']}")

            # Get current state from checkpoint
            state_snapshot = await graph.aget_state(config)
            existing_state = state_snapshot.values

            # Create redraft state with feedback
            redraft_state = create_redraft_state(
                existing_state=existing_state,
                reviewer_feedback=feedback_text,
            )

            # Mark old draft as rejected (replaced by new version)
            await db.update_draft_status(UUID(draft["id"]), "rejected")

            # Invoke workflow with redraft state
            # This will: draft_reply → send_to_reviewer → END (interrupt)
            result = await graph.ainvoke(redraft_state, config)

            # Send confirmation
            await whatsapp_service.send_confirmation(
                reviewer_phone=reviewer_phone,
                action="redrafting",
                details=feedback_text,
            )

            return {
                "success": True,
                "action": "feedback",
                "old_draft_id": draft["id"],
                "new_version": redraft_state["version_number"],
                "thread_id": draft["thread_id"],
                "workflow_status": result.get("current_step"),
            }

        elif action == "reject":
            # Mark draft and thread as rejected
            logger.info(f"Rejecting draft {draft['id']}")

            # Update draft status
            await db.update_draft_status(UUID(draft["id"]), "rejected")

            # Update thread status
            await db.update_thread_status(UUID(draft["thread_id"]), "rejected")

            # Log event
            await db.log_event(
                event_type="draft_rejected",
                actor=f"reviewer:{reviewer['id']}",
                details={"draft_id": draft["id"]},
                thread_id=UUID(draft["thread_id"]),
                draft_id=UUID(draft["id"]),
            )

            # Send confirmation
            await whatsapp_service.send_confirmation(
                reviewer_phone=reviewer_phone,
                action="rejected",
            )

            return {
                "success": True,
                "action": "rejected",
                "draft_id": draft["id"],
                "thread_id": draft["thread_id"],
            }

        return {"success": True}

    except Exception as e:
        logger.error(f"WhatsApp webhook error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process WhatsApp message: {str(e)}",
        )


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
