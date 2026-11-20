"""Notification Agent: creates in-app notifications (deduplicated)."""
from pydantic import BaseModel
from sqlalchemy import select

from app.agents.base import Agent
from app.models import Notification


class NotifyIn(BaseModel):
    user_id: str
    type: str
    title: str
    body: str = ""
    link: str | None = None


class NotifyOut(BaseModel):
    notification_id: str | None = None
    created: bool = False


class NotificationAgent(Agent[NotifyIn, NotifyOut]):
    name = "notification"
    input_model, output_model = NotifyIn, NotifyOut

    def run(self, d: NotifyIn) -> NotifyOut:
        dup = self.db.scalars(select(Notification).where(
            Notification.user_id == d.user_id, Notification.type == d.type,
            Notification.link == d.link, Notification.title == d.title, Notification.is_read.is_(False))).first()
        if dup:
            return NotifyOut(notification_id=dup.id, created=False)
        n = Notification(user_id=d.user_id, type=d.type, title=d.title[:200], body=d.body[:500], link=d.link)
        self.db.add(n)
        self.db.commit()
        return NotifyOut(notification_id=n.id, created=True)


def notify(db, user_id: str, type: str, title: str, body: str = "", link: str | None = None):
    """Direct helper for request handlers (same agent, no orchestration logging)."""
    return NotificationAgent(db).run(NotifyIn(user_id=user_id, type=type, title=title, body=body, link=link))
