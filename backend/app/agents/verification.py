"""Verification Agent: owns the ownership-verification state machine.

It never decides ownership. Approval always requires an authorised human reviewer
(the finder, a verification agent, or an admin) and the claimant can never review their own claim.
"""
from fastapi import HTTPException

TRANSITIONS = {
    "pending": {"under_review"},          # claimant submits answers
    "under_review": {"approved", "rejected"},  # human review
    "approved": {"completed"},            # handover recorded
    "rejected": set(),
    "completed": set(),
}

DEFAULT_QUESTIONS = [
    "Describe any marks, scratches, stickers or damage that are unique to your item.",
    "What was inside, attached to, or stored on the item?",
    "Where and roughly when did you last have it?",
]


def assert_transition(current: str, target: str):
    if target not in TRANSITIONS.get(current, set()):
        raise HTTPException(409, f"Cannot move a verification from '{current}' to '{target}'.")


def questions_for(found_report) -> list[str]:
    custom = [q for q in (found_report.verification_questions or []) if q and q.strip()]
    return custom[:5] or DEFAULT_QUESTIONS
