"""Pytest configuration and fixtures."""

import asyncio
import os
from typing import AsyncGenerator, Dict
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from src.main import app
from src.services.database import DatabaseService as Database
from src.core.config import Settings


# =============================================================================
# Pytest Configuration
# =============================================================================


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# =============================================================================
# Settings and Environment
# =============================================================================


@pytest.fixture(scope="session", autouse=True)
def test_settings() -> Settings:
    """Test settings with overrides - runs automatically for all tests."""
    os.environ["ENVIRONMENT"] = "development"
    os.environ["SUPABASE_URL"] = "https://test.supabase.co"
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key"
    os.environ["DATABASE_URL"] = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/hermes_test"
    )
    os.environ["ANTHROPIC_API_KEY"] = "test-key"
    os.environ["TWILIO_ACCOUNT_SID"] = "test-sid"
    os.environ["TWILIO_AUTH_TOKEN"] = "test-token"
    os.environ["TWILIO_WHATSAPP_NUMBER"] = "whatsapp:+15555555555"
    os.environ["SENDGRID_API_KEY"] = "test-sendgrid-key"
    os.environ["INTAKE_EMAIL_ADDRESS"] = "intake@example.com"
    os.environ["FROM_EMAIL"] = "support@example.com"

    from src.core.config import get_settings
    return get_settings()


# =============================================================================
# HTTP Clients
# =============================================================================


@pytest.fixture
def client() -> TestClient:
    """Synchronous FastAPI test client."""
    return TestClient(app)


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Asynchronous HTTP client for testing."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


# =============================================================================
# Database Fixtures
# =============================================================================


@pytest_asyncio.fixture
async def db(test_settings: Settings) -> AsyncGenerator[Database, None]:
    """Database instance for testing."""
    from src.services.database import get_database
    
    db = get_database()
    
    # Setup: Clean test database before each test
    # In production, you'd want to run migrations and create test schema
    
    yield db
    
    # Teardown: Clean up after test
    # In production, you'd rollback transactions or truncate tables


# =============================================================================
# Test Data Fixtures
# =============================================================================


@pytest.fixture
def test_reviewer() -> Dict:
    """Test reviewer data."""
    return {
        "id": str(uuid4()),
        "name": "Test Reviewer",
        "email": "reviewer@example.com",
        "phone_number": "+1234567890",
        "is_active": True,
    }


@pytest.fixture
def test_thread() -> Dict:
    """Test thread data."""
    return {
        "id": str(uuid4()),
        "customer_email": "customer@example.com",
        "subject": "Test inquiry",
        "status": "active",
        "message_id": "<test-message-id@example.com>",
        "in_reply_to": None,
        "references": [],
    }


@pytest.fixture
def test_draft(test_thread: Dict) -> Dict:
    """Test draft data."""
    return {
        "id": str(uuid4()),
        "thread_id": test_thread["id"],
        "version_number": 1,
        "content": "This is a test draft reply.",
        "confidence_score": 0.85,
        "status": "pending",
        "whatsapp_message_sid": "test-whatsapp-sid",
    }


@pytest.fixture
def test_email_form_data() -> Dict[str, str]:
    """Test SendGrid inbound email form data."""
    return {
        "from": "customer@example.com",
        "to": "support@example.com",
        "subject": "Test inquiry",
        "text": "This is a test email body.",
        "html": "<p>This is a test email body.</p>",
        "headers": """Message-ID: <test-message-id@example.com>
From: customer@example.com
To: support@example.com
Subject: Test inquiry""",
    }


# =============================================================================
# Mock External Services
# =============================================================================


@pytest.fixture
def mock_anthropic():
    """Mock Anthropic Claude API."""
    with patch("src.services.llm.Anthropic") as mock:
        # Mock intent extraction response
        intent_response = MagicMock()
        intent_response.content = [MagicMock(text='{"intent": "question", "confidence": 0.85}')]
        intent_response.usage = MagicMock(input_tokens=100, output_tokens=50)
        
        # Mock draft response
        draft_response = MagicMock()
        draft_response.content = [MagicMock(text="Thank you for your inquiry. Here is the answer.")]
        draft_response.usage = MagicMock(input_tokens=150, output_tokens=100)
        
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = [intent_response, draft_response]
        mock.return_value = mock_client
        
        yield mock


@pytest.fixture
def mock_twilio():
    """Mock Twilio WhatsApp API."""
    with patch("src.services.whatsapp.Client") as mock:
        mock_client = MagicMock()
        
        # Mock message creation
        mock_message = MagicMock()
        mock_message.sid = "test-whatsapp-sid-123"
        mock_message.status = "sent"
        mock_client.messages.create.return_value = mock_message
        
        mock.return_value = mock_client
        yield mock


@pytest.fixture
def mock_sendgrid():
    """Mock SendGrid email API."""
    with patch("src.services.email.SendGridAPIClient") as mock:
        mock_client = MagicMock()
        
        # Mock send response
        mock_response = MagicMock()
        mock_response.status_code = 202
        mock_response.headers = {"X-Message-Id": "test-sendgrid-message-id"}
        mock_client.send.return_value = mock_response
        
        mock.return_value = mock_client
        yield mock


@pytest.fixture(autouse=True)
def mock_postgres_checkpointer():
    """Mock PostgresSaver to prevent real database connections in tests."""
    with patch("src.workflows.graph.psycopg.connect") as mock_connect:
        # Mock connection
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn

        # Mock PostgresSaver with async methods
        with patch("src.workflows.graph.PostgresSaver") as mock_saver:
            mock_checkpointer = MagicMock()
            mock_checkpointer.setup = MagicMock()

            # Mock async methods used by LangGraph
            mock_checkpointer.aget_tuple = AsyncMock(return_value=None)
            mock_checkpointer.aput = AsyncMock()
            mock_checkpointer.alist = AsyncMock(return_value=[])

            mock_saver.return_value = mock_checkpointer

            yield mock_checkpointer


@pytest.fixture
def mock_all_services(mock_anthropic, mock_twilio, mock_sendgrid):
    """Convenience fixture to mock all external services."""
    return {
        "anthropic": mock_anthropic,
        "twilio": mock_twilio,
        "sendgrid": mock_sendgrid,
    }
