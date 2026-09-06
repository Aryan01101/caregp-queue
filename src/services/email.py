"""Email service for parsing and sending emails."""

import logging
import re
from email import policy
from email.parser import BytesParser
from typing import Dict, List, Optional

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from src.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for handling email operations."""

    def __init__(self) -> None:
        """Initialize email service with SendGrid client."""
        settings = get_settings()
        self.client = SendGridAPIClient(settings.sendgrid_api_key)
        self.from_email = settings.from_email
        self.from_name = settings.from_name
        self.intake_email = settings.intake_email_address

    # =========================================================================
    # Inbound Email Parsing
    # =========================================================================

    def parse_sendgrid_payload(self, form_data: Dict[str, str]) -> Dict[str, any]:
        """
        Parse SendGrid Inbound Parse webhook payload.

        SendGrid sends emails as multipart/form-data with fields:
        - from: Sender email address
        - to: Recipient email address
        - subject: Email subject
        - text: Plain text body
        - html: HTML body (if present)
        - headers: Raw email headers
        - envelope: SMTP envelope data

        Args:
            form_data: Form data from SendGrid webhook

        Returns:
            Dict containing parsed email data
        """
        try:
            # Extract basic fields
            from_email = form_data.get("from", "")
            to_email = form_data.get("to", "")
            subject = form_data.get("subject", "")
            text_body = form_data.get("text", "")
            html_body = form_data.get("html")

            # Parse headers to extract threading information
            raw_headers = form_data.get("headers", "")
            headers = self._parse_headers(raw_headers)

            # Extract threading headers
            message_id = headers.get("Message-ID", "")
            in_reply_to = headers.get("In-Reply-To")
            references_raw = headers.get("References", "")
            references = self._parse_references(references_raw)

            return {
                "from_email": from_email,
                "to_email": to_email,
                "subject": subject,
                "text_body": text_body,
                "html_body": html_body,
                "message_id": message_id,
                "in_reply_to": in_reply_to,
                "references": references,
                "raw_headers": raw_headers,
            }

        except Exception as e:
            logger.error(f"Failed to parse SendGrid payload: {e}", exc_info=True)
            raise ValueError(f"Invalid SendGrid payload: {e}")

    def _parse_headers(self, raw_headers: str) -> Dict[str, str]:
        """
        Parse raw email headers into a dictionary.

        Args:
            raw_headers: Raw header string from SendGrid

        Returns:
            Dict of header name -> value
        """
        headers = {}
        if not raw_headers:
            return headers

        try:
            # Parse headers using email library
            # SendGrid provides headers as a string
            parser = BytesParser(policy=policy.default)
            msg = parser.parsebytes(raw_headers.encode("utf-8"))

            for key, value in msg.items():
                headers[key] = value

        except Exception as e:
            logger.warning(f"Failed to parse headers: {e}")

        return headers

    def _parse_references(self, references_raw: str) -> List[str]:
        """
        Parse References header into list of message IDs.

        References header contains space-separated message IDs.

        Args:
            references_raw: Raw References header value

        Returns:
            List of message IDs
        """
        if not references_raw:
            return []

        # Message IDs are enclosed in angle brackets: <id@domain>
        # Split by whitespace and extract IDs
        message_ids = []
        for match in re.finditer(r"<([^>]+)>", references_raw):
            message_ids.append(match.group(1))

        return message_ids

    def extract_reply_content(self, text_body: str) -> str:
        """
        Extract only the new reply content from an email.

        Removes quoted text, signatures, and previous email content.

        Common patterns to remove:
        - "On [date], [sender] wrote:"
        - Lines starting with ">" (quoted text)
        - Email signatures (-- separator)
        - Previous email chains

        Args:
            text_body: Full email text body

        Returns:
            Cleaned reply content
        """
        lines = text_body.split("\n")
        reply_lines = []

        for line in lines:
            # Stop at common reply indicators
            if line.strip().startswith(">"):
                break
            if line.strip().startswith("On ") and " wrote:" in line:
                break
            if line.strip() == "--":
                break
            if line.strip().startswith("From:"):
                break

            reply_lines.append(line)

        # Join and clean up
        reply_text = "\n".join(reply_lines).strip()
        return reply_text

    # =========================================================================
    # Outbound Email Sending
    # =========================================================================

    async def send_email(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        references: Optional[List[str]] = None,
    ) -> Dict[str, any]:
        """
        Send an email via SendGrid.

        Args:
            to_email: Recipient email address
            subject: Email subject
            text_body: Plain text body
            html_body: Optional HTML body
            in_reply_to: Optional Message-ID this is replying to
            references: Optional list of Message-IDs in thread

        Returns:
            Dict with send status and message ID
        """
        try:
            # Create message
            message = Mail(
                from_email=(self.from_email, self.from_name),
                to_emails=to_email,
                subject=subject,
                plain_text_content=text_body,
                html_content=html_body,
            )

            # Add threading headers if this is a reply
            if in_reply_to:
                message.header = message.header or {}
                message.header["In-Reply-To"] = f"<{in_reply_to}>"

                if references:
                    # References should include all previous messages + in_reply_to
                    all_refs = references + [in_reply_to]
                    refs_str = " ".join([f"<{ref}>" for ref in all_refs])
                    message.header["References"] = refs_str

            # Send email
            response = self.client.send(message)

            logger.info(
                f"Email sent to {to_email} with status {response.status_code}"
            )

            return {
                "success": True,
                "status_code": response.status_code,
                "message_id": response.headers.get("X-Message-Id"),
            }

        except Exception as e:
            logger.error(f"Failed to send email: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }


# Singleton instance
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Get or create email service instance."""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
