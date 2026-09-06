"""LangGraph state schema for email triage workflow."""

from typing import Annotated, Literal, TypedDict

from langgraph.graph import add_messages


class EmailTriageState(TypedDict):
    """
    State for email triage workflow.

    This state tracks the complete lifecycle of an email from receipt
    to final reply, including human review via WhatsApp.
    """

    # Thread and draft identifiers
    thread_id: str
    draft_id: str | None
    version_number: int

    # Email content
    customer_email: str
    subject: str
    email_body: str
    message_id: str
    in_reply_to: str | None
    references: list[str]

    # LLM analysis
    intent_data: dict | None
    intent_confidence: float

    # Draft content
    draft_content: str | None
    draft_confidence: float
    overall_confidence: float

    # WhatsApp review
    whatsapp_message_sid: str | None
    reviewer_action: Literal["approve", "feedback", "reject"] | None
    reviewer_feedback: str | None

    # Workflow control
    current_step: Literal[
        "parse_email",
        "extract_intent",
        "draft_reply",
        "send_to_reviewer",
        "await_review",
        "process_feedback",
        "send_email",
        "complete",
    ]
    retry_count: int
    error: str | None

    # Conversation history (for multi-turn refinement)
    messages: Annotated[list, add_messages]


class WorkflowConfig(TypedDict):
    """Configuration for workflow execution."""

    # Thread configuration
    thread_id: str
    configurable: dict  # For LangGraph checkpoint configuration


def create_initial_state(
    thread_id: str,
    customer_email: str,
    subject: str,
    email_body: str,
    message_id: str,
    in_reply_to: str | None = None,
    references: list[str] | None = None,
) -> EmailTriageState:
    """
    Create initial state for a new email workflow.

    Args:
        thread_id: Database thread UUID
        customer_email: Sender email address
        subject: Email subject
        email_body: Email body text
        message_id: Email Message-ID header
        in_reply_to: Optional In-Reply-To header
        references: Optional References header list

    Returns:
        Initial EmailTriageState
    """
    return EmailTriageState(
        # Thread and draft
        thread_id=thread_id,
        draft_id=None,
        version_number=1,
        # Email content
        customer_email=customer_email,
        subject=subject,
        email_body=email_body,
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references or [],
        # LLM analysis
        intent_data=None,
        intent_confidence=0.0,
        # Draft content
        draft_content=None,
        draft_confidence=0.0,
        overall_confidence=0.0,
        # WhatsApp review
        whatsapp_message_sid=None,
        reviewer_action=None,
        reviewer_feedback=None,
        # Workflow control
        current_step="parse_email",
        retry_count=0,
        error=None,
        # Conversation history
        messages=[],
    )


def create_redraft_state(
    existing_state: EmailTriageState,
    reviewer_feedback: str,
) -> EmailTriageState:
    """
    Create state for redrafting after feedback.

    Args:
        existing_state: Previous workflow state
        reviewer_feedback: Feedback from reviewer

    Returns:
        Updated state for redraft workflow
    """
    return {
        **existing_state,
        "version_number": existing_state["version_number"] + 1,
        "draft_id": None,  # Will be assigned when new draft is created
        "reviewer_feedback": reviewer_feedback,
        "whatsapp_message_sid": None,  # Will be assigned when new WhatsApp sent
        "reviewer_action": None,  # Reset for new review
        "current_step": "draft_reply",  # Jump back to drafting
        "retry_count": existing_state["retry_count"] + 1,
    }
