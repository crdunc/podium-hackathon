from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Lead(BaseModel):
    id: str
    company_name: str
    trade_category: str
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    has_website: bool = False
    contacts: List[str] = Field(default_factory=list)
    google_place_id: Optional[str] = None
    business_status: Optional[str] = None
    collected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict = Field(default_factory=dict)


class LeadCollection(BaseModel):
    city: str
    leads: List[Lead] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def add_leads(self, new_leads: List[Lead]) -> int:
        """Add leads, deduplicating by google_place_id. Returns count of new leads added."""
        existing_ids = {lead.google_place_id for lead in self.leads if lead.google_place_id}
        added = 0
        for lead in new_leads:
            if lead.google_place_id and lead.google_place_id in existing_ids:
                continue
            self.leads.append(lead)
            if lead.google_place_id:
                existing_ids.add(lead.google_place_id)
            added += 1
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return added

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, path: Path) -> LeadCollection:
        if path.exists():
            return cls.model_validate_json(path.read_text())
        raise FileNotFoundError(f"No lead file at {path}")
