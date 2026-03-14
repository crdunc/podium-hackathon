from __future__ import annotations

import logging
from typing import List

from supabase import create_client

from src.config import SUPABASE_KEY, SUPABASE_URL
from src.models import Lead

logger = logging.getLogger(__name__)


def get_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def upsert_leads(leads: List[Lead], city: str) -> int:
    """Upsert leads into Supabase. Returns count of rows upserted."""
    client = get_client()
    rows = []
    for lead in leads:
        row = lead.model_dump()
        row["city"] = city
        # Convert contacts list and metadata dict to JSON-compatible format
        rows.append(row)

    if not rows:
        return 0

    result = client.table("leads").upsert(rows, on_conflict="google_place_id").execute()
    count = len(result.data) if result.data else 0
    logger.info("Upserted %d leads to Supabase for %s", count, city)
    return count


def get_all_leads() -> List[dict]:
    """Fetch all leads from Supabase."""
    client = get_client()
    result = client.table("leads").select("*").execute()
    return result.data or []


def get_leads_by_city(city: str) -> List[dict]:
    """Fetch leads for a specific city."""
    client = get_client()
    result = client.table("leads").select("*").eq("city", city).execute()
    return result.data or []
