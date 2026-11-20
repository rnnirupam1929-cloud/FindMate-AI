"""Communication Agent: suggests a safe, template-based handover plan.

It is rule/template based (not a language model) and never shares personal contact details.
"""
from pydantic import BaseModel

from app.agents.base import Agent


class CommIn(BaseModel):
    institution_name: str = "your campus"
    found_location: str | None = None


class CommOut(BaseModel):
    guidance: list[str]
    suggested_message: str


class CommunicationAgent(Agent[CommIn, CommOut]):
    name = "communication"
    input_model, output_model = CommIn, CommOut

    def run(self, d: CommIn) -> CommOut:
        place = d.found_location or "a public place"
        return CommOut(
            guidance=[
                f"Meet in a busy, well-lit spot on {d.institution_name}, such as the main gate, library entrance or security desk.",
                "Bring a college ID so the reviewer can confirm who collected the item.",
                "Do not share home addresses or personal phone numbers. Use FindMate to coordinate.",
                "Consider handing the item to campus security or the lost-and-found desk if you are not comfortable meeting.",
            ],
            suggested_message=f"Hi! Your ownership claim was approved. Could we meet near {place} during daytime hours to complete the handover?")
