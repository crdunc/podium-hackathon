from __future__ import annotations

import asyncio
import logging
import re

from src.config import DATA_DIR, REQUEST_DELAY, SUPABASE_URL, TRADE_CATEGORIES
from src.models import Lead, LeadCollection
from src.scrapers.google_places import GooglePlacesScraper

logger = logging.getLogger(__name__)


def _city_to_filename(city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-") + ".json"


async def scrape_city(
    city: str,
    trades: list[str] | None = None,
    api_key: str | None = None,
) -> LeadCollection:
    """Scrape leads for a city across one or more trade categories."""
    trades = trades or TRADE_CATEGORIES
    scraper = GooglePlacesScraper(api_key=api_key)

    filename = _city_to_filename(city)
    filepath = DATA_DIR / filename

    # Load existing leads or create new collection
    try:
        collection = LeadCollection.load(filepath)
        logger.info("Loaded %d existing leads from %s", len(collection.leads), filepath)
    except FileNotFoundError:
        collection = LeadCollection(city=city)

    total_new = 0
    for trade in trades:
        leads = await scraper.search(trade, city)
        added = collection.add_leads(leads)
        total_new += added
        logger.info("[%s] %s: %d found, %d new", city, trade, len(leads), added)
        await asyncio.sleep(REQUEST_DELAY)

    collection.save(filepath)
    logger.info("Saved %d total leads (%d new) to %s", len(collection.leads), total_new, filepath)

    # Also save to Supabase if configured
    if SUPABASE_URL:
        try:
            from src.db import upsert_leads
            upsert_leads(collection.leads, city)
        except Exception as e:
            logger.error("Failed to save to Supabase: %s", e)

    return collection
