"""
client.py

Typed HTTP client that calls the Next.js internal agent execution endpoint.
Each LangGraph node uses this to run one TypeScript agent step.

Environment variables required:
  NEXT_INTERNAL_URL      Base URL of the Next.js app (e.g. http://localhost:3000)
  INTERNAL_AGENT_SECRET  Shared secret; must match the Next.js env var of the same name
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

NEXT_INTERNAL_URL = os.environ.get("NEXT_INTERNAL_URL", "http://localhost:3000")
INTERNAL_AGENT_SECRET = os.environ.get("INTERNAL_AGENT_SECRET", "")

EXECUTE_URL = f"{NEXT_INTERNAL_URL.rstrip('/')}/api/internal/agent/execute"

# Retry on transient network errors only; not on 4xx.
_RETRY_POLICY = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException)),
    reraise=True,
)


class AgentClientError(Exception):
    """Raised when the agent execution HTTP call fails."""

    def __init__(self, step: str, status: int, detail: str) -> None:
        self.step = step
        self.status = status
        self.detail = detail
        super().__init__(f"Agent step '{step}' failed (HTTP {status}): {detail}")


class AgentClient:
    """Synchronous-friendly async HTTP client for the internal agent API."""

    def __init__(self, timeout: float = 120.0) -> None:
        self._timeout = timeout
        self._headers = {
            "Content-Type": "application/json",
            "X-Internal-Agent-Secret": INTERNAL_AGENT_SECRET,
        }

    @_RETRY_POLICY
    async def execute(self, step: str, payload: dict[str, Any], request_id: str | None = None) -> Any:
        """
        Run one agent step and return the `result` field of the response.
        Raises AgentClientError on non-2xx responses.
        """
        headers = dict(self._headers)
        if request_id:
            headers["X-Request-Id"] = request_id

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                EXECUTE_URL,
                json={"step": step, "payload": payload},
                headers=headers,
            )

        if resp.status_code != 200:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                detail = resp.text
            raise AgentClientError(step, resp.status_code, detail)

        try:
            data = resp.json()
        except Exception as exc:
            raise AgentClientError(step, 200, f"Response was not JSON: {exc}") from exc

        try:
            result = data["data"]["result"]
        except (KeyError, TypeError) as exc:
            raise AgentClientError(step, 200, f"Response envelope missing data.result field: {exc}") from exc

        return result
