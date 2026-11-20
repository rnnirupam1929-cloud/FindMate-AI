"""Agent framework: typed input/output, timeouts, bounded retries, execution logging.

Each agent is a small class with `run(input) -> output`. The AgentRunner is the only place that
handles timeouts, retries and AgentLog persistence, so agents stay simple and testable.
"""
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AgentLog

In = TypeVar("In", bound=BaseModel)
Out = TypeVar("Out", bound=BaseModel)

_pool = ThreadPoolExecutor(max_workers=4)


class AgentError(Exception):
    pass


class Agent(Generic[In, Out]):
    name = "agent"
    input_model: type[BaseModel]
    output_model: type[BaseModel]

    def __init__(self, db: Session):
        self.db = db

    def run(self, data: In) -> Out:  # pragma: no cover - interface
        raise NotImplementedError


class AgentRunner:
    def __init__(self, db: Session, run_id: str):
        self.db, self.run_id = db, run_id

    def call(self, agent: Agent, data: BaseModel, fallback: BaseModel | None = None) -> BaseModel | None:
        s = get_settings()
        attempts, started, error, status, out = 0, time.monotonic(), None, "error", None
        for attempt in range(1, s.agent_max_retries + 2):
            attempts = attempt
            try:
                fut = _pool.submit(agent.run, data)
                out = fut.result(timeout=s.agent_timeout_seconds)
                status, error = "ok", None
                break
            except FutureTimeout:
                status, error = "timeout", f"exceeded {s.agent_timeout_seconds}s"
                break  # a timed-out run may still be executing; never retry it
            except Exception as exc:  # noqa: BLE001 - agents must never crash the request
                status, error = "error", f"{type(exc).__name__}: {exc}"[:500]
                self.db.rollback()
        duration = int((time.monotonic() - started) * 1000)
        self.db.add(AgentLog(run_id=self.run_id, agent=agent.name, status=status, attempts=attempts,
                             input_summary=data.model_dump_json()[:480], duration_ms=duration, error=error,
                             output_summary=(out.model_dump_json()[:480] if out is not None else None)))
        self.db.commit()
        return out if status == "ok" else fallback
