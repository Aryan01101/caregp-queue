"""Unit tests for email service."""

import pytest
from src.services.email import EmailService


@pytest.mark.unit
class TestEmailService:
    """Test EmailService functionality."""

    def test_extract_reply_content_simple(self):
        """Test extracting reply from simple email."""
        service = EmailService()
        
        text = "This is my reply.\n\nThanks!"
        result = service.extract_reply_content(text)
        
        assert result == "This is my reply.\n\nThanks!"

    def test_extract_reply_content_with_quote(self):
        """Test removing quoted text."""
        service = EmailService()
        
        text = """This is my reply.

> On Mon, Jan 1, 2024 at 10:00 AM, someone@example.com wrote:
> This is the previous message."""
        
        result = service.extract_reply_content(text)
        assert result.strip() == "This is my reply."

    def test_extract_reply_content_with_signature(self):
        """Test removing email signature."""
        service = EmailService()
        
        text = """This is my reply.

Thanks,
John

--
John Doe
CEO, Example Corp
john@example.com"""
        
        result = service.extract_reply_content(text)
        assert "This is my reply." in result
        assert "--" not in result or result.index("--") > result.index("reply")

    def test_extract_reply_content_with_from_line(self):
        """Test removing forwarded message."""
        service = EmailService()
        
        text = """This is my reply.

From: someone@example.com
Sent: Monday, January 1, 2024 10:00 AM
To: me@example.com
Subject: RE: Test

Previous message content..."""
        
        result = service.extract_reply_content(text)
        assert result.strip() == "This is my reply."

    def test_parse_headers(self):
        """Test parsing email headers."""
        service = EmailService()
        
        headers = """Message-ID: <test@example.com>
From: sender@example.com
To: recipient@example.com
Subject: Test
In-Reply-To: <previous@example.com>
References: <ref1@example.com> <ref2@example.com>"""
        
        parsed = service._parse_headers(headers)
        
        assert parsed["Message-ID"] == "<test@example.com>"
        assert parsed["From"] == "sender@example.com"
        assert parsed["In-Reply-To"] == "<previous@example.com>"
        assert "References" in parsed

    def test_parse_references(self):
        """Test parsing References header."""
        service = EmailService()

        references_str = "<ref1@example.com> <ref2@example.com> <ref3@example.com>"
        parsed = service._parse_references(references_str)

        assert len(parsed) == 3
        assert parsed[0] == "ref1@example.com"
        assert parsed[2] == "ref3@example.com"

    def test_parse_references_empty(self):
        """Test parsing empty References header."""
        service = EmailService()
        
        parsed = service._parse_references("")
        assert parsed == []
