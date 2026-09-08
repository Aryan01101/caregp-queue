"""LLM service for multi-provider LLM integration (Anthropic Claude & Google Gemini)."""

import json
import logging
from typing import Dict, List, Optional

from src.core.config import get_settings

logger = logging.getLogger(__name__)


class LLMService:
    """Service for interacting with LLM APIs (Anthropic or Gemini)."""

    def __init__(self) -> None:
        """Initialize LLM service with configured provider."""
        settings = get_settings()
        self.provider = settings.llm_provider.lower()

        if self.provider == "anthropic":
            from anthropic import Anthropic

            if not settings.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY required when llm_provider=anthropic")
            self.client = Anthropic(api_key=settings.anthropic_api_key)
            self.model = settings.claude_model
            logger.info(f"Initialized Anthropic client with model {self.model}")

        elif self.provider == "gemini":
            import google.generativeai as genai

            if not settings.gemini_api_key:
                raise ValueError("GEMINI_API_KEY required when llm_provider=gemini")
            genai.configure(api_key=settings.gemini_api_key)
            self.client = genai.GenerativeModel(settings.gemini_model)
            self.model = settings.gemini_model
            logger.info(f"Initialized Gemini client with model {self.model}")

        else:
            raise ValueError(f"Unknown llm_provider: {self.provider}. Must be 'anthropic' or 'gemini'")

    # =========================================================================
    # Intent Extraction
    # =========================================================================

    async def extract_intent(
        self,
        email_body: str,
        subject: str,
        previous_context: Optional[str] = None,
    ) -> Dict[str, any]:
        """
        Extract intent and key information from customer email.

        Analyzes the email to determine:
        - Intent category (question, complaint, request, etc.)
        - Urgency level
        - Key entities (product names, dates, order numbers)
        - Sentiment
        - Action items

        Args:
            email_body: Customer email text
            subject: Email subject line
            previous_context: Optional previous conversation context

        Returns:
            Dict containing extracted intent and metadata
        """
        try:
            # Build context-aware prompt
            system_prompt = """You are an AI assistant analyzing customer service emails.
Extract the following information:
1. Intent category (question, complaint, request, feedback, escalation, other)
2. Urgency (low, medium, high, critical)
3. Key entities (products, dates, order numbers, etc.)
4. Sentiment (positive, neutral, negative)
5. Action items required
6. Confidence in understanding (0.0-1.0)

Respond in JSON format."""

            user_message = f"""Subject: {subject}

Email:
{email_body}"""

            if previous_context:
                user_message += f"\n\nPrevious context:\n{previous_context}"

            # Call LLM API
            response_data = await self._call_llm(
                system_prompt=system_prompt,
                user_message=user_message,
                max_tokens=1000,
            )

            content = response_data["content"]

            # Try to parse as JSON
            try:
                intent_data = json.loads(content)
            except json.JSONDecodeError:
                # If not valid JSON, structure it ourselves
                intent_data = {
                    "raw_response": content,
                    "confidence": 0.5,
                }

            logger.info(f"Extracted intent with confidence {intent_data.get('confidence', 0.0)}")

            return {
                "success": True,
                "intent": intent_data,
                "usage": response_data.get("usage", {}),
            }

        except Exception as e:
            logger.error(f"Failed to extract intent: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }

    # =========================================================================
    # Reply Drafting
    # =========================================================================

    async def draft_reply(
        self,
        email_body: str,
        subject: str,
        intent_data: Dict[str, any],
        previous_drafts: Optional[List[Dict[str, any]]] = None,
        feedback: Optional[str] = None,
    ) -> Dict[str, any]:
        """
        Generate a draft reply to customer email.

        Args:
            email_body: Customer email text
            subject: Email subject line
            intent_data: Intent extracted from email
            previous_drafts: Optional list of previous draft attempts
            feedback: Optional human feedback on previous draft

        Returns:
            Dict containing draft reply and confidence score
        """
        try:
            # Build context-aware prompt
            system_prompt = """You are a professional customer service representative.
Write a clear, empathetic, and helpful reply to the customer email.

Guidelines:
- Be professional but warm
- Address all customer concerns
- Provide actionable next steps
- Keep it concise
- Match the customer's tone
- Do not make promises you can't keep

Also provide a confidence score (0.0-1.0) for your draft."""

            user_message = f"""Customer email:
Subject: {subject}

{email_body}

Intent analysis:
{json.dumps(intent_data, indent=2)}"""

            # Add previous drafts and feedback if available
            if previous_drafts and feedback:
                user_message += f"\n\nPrevious attempts and feedback:"
                for i, draft in enumerate(previous_drafts, 1):
                    user_message += f"\n\nDraft {i}:\n{draft.get('content', '')}"
                user_message += f"\n\nFeedback:\n{feedback}"
                user_message += "\n\nPlease incorporate the feedback and improve the draft."

            # Call LLM API
            response_data = await self._call_llm(
                system_prompt=system_prompt,
                user_message=user_message,
                max_tokens=2000,
            )

            content = response_data["content"]

            # Try to extract confidence score if provided
            confidence = self._extract_confidence(content)

            logger.info(f"Generated draft reply with confidence {confidence}")

            return {
                "success": True,
                "draft": {
                    "content": content,
                    "confidence": confidence,
                },
                "usage": response_data.get("usage", {}),
            }

        except Exception as e:
            logger.error(f"Failed to draft reply: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }

    def _extract_confidence(self, draft_text: str) -> float:
        """
        Extract confidence score from draft text.

        Looks for patterns like:
        - "Confidence: 0.85"
        - "Confidence Score: 85%"

        Args:
            draft_text: Draft reply text

        Returns:
            Confidence score between 0.0 and 1.0
        """
        import re

        # Try to find confidence score in text
        patterns = [
            r"confidence[:\s]+([0-9.]+)",
            r"confidence score[:\s]+([0-9.]+)",
            r"confidence[:\s]+([0-9]+)%",
        ]

        for pattern in patterns:
            match = re.search(pattern, draft_text.lower())
            if match:
                try:
                    score = float(match.group(1))
                    # Normalize if percentage
                    if score > 1.0:
                        score = score / 100.0
                    return min(1.0, max(0.0, score))
                except ValueError:
                    continue

        # Default medium confidence if not found
        return 0.7

    # =========================================================================
    # Provider-Agnostic LLM Call
    # =========================================================================

    async def _call_llm(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1000,
    ) -> Dict[str, any]:
        """
        Call the configured LLM provider.

        Args:
            system_prompt: System instructions
            user_message: User message
            max_tokens: Maximum tokens to generate

        Returns:
            Dict with 'content' and optional 'usage' keys
        """
        if self.provider == "anthropic":
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return {
                "content": response.content[0].text,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            }

        elif self.provider == "gemini":
            # Gemini uses a combined prompt format
            combined_prompt = f"{system_prompt}\n\n{user_message}"
            response = self.client.generate_content(
                combined_prompt,
                generation_config={"max_output_tokens": max_tokens},
            )
            return {
                "content": response.text,
                "usage": {},  # Gemini doesn't expose usage stats in the same way
            }

        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    # =========================================================================
    # Confidence Scoring
    # =========================================================================

    def calculate_confidence_score(
        self,
        intent_confidence: float,
        draft_confidence: float,
        has_previous_context: bool = False,
        has_feedback: bool = False,
    ) -> float:
        """
        Calculate overall confidence score for a draft.

        Combines multiple factors:
        - Intent extraction confidence
        - Draft generation confidence
        - Presence of conversation history
        - Incorporation of feedback

        Args:
            intent_confidence: Confidence from intent extraction
            draft_confidence: Confidence from draft generation
            has_previous_context: Whether we have conversation history
            has_feedback: Whether draft incorporates feedback

        Returns:
            Combined confidence score (0.0-1.0)
        """
        # Base score is average of intent and draft confidence
        base_score = (intent_confidence + draft_confidence) / 2.0

        # Boost for context and feedback
        if has_previous_context:
            base_score *= 1.1  # 10% boost for context

        if has_feedback:
            base_score *= 1.15  # 15% boost for incorporating feedback

        # Cap at 1.0
        return min(1.0, base_score)


# Singleton instance
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """Get or create LLM service instance."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
