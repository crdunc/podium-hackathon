from __future__ import annotations

import asyncio
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from src.config import GOOGLE_MAPS_API_KEY, REQUEST_DELAY
from src.models import Lead
from src.scrapers.base import BaseScraper

logger = logging.getLogger(__name__)

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.types",
    "places.businessStatus",
])


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout))


class GooglePlacesScraper(BaseScraper):
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or GOOGLE_MAPS_API_KEY
        if not self.api_key:
            raise ValueError("GOOGLE_MAPS_API_KEY is required. Set it in .env")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception(_is_retryable),
    )
    async def _request(self, client: httpx.AsyncClient, text_query: str, page_token: str | None = None) -> dict:
        body: dict = {"textQuery": text_query}
        if page_token:
            body["pageToken"] = page_token

        response = await client.post(
            SEARCH_URL,
            json=body,
            headers={
                "X-Goog-Api-Key": self.api_key,
                "X-Goog-FieldMask": FIELD_MASK,
            },
        )
        response.raise_for_status()
        return response.json()

    async def search(self, query: str, location: str) -> list[Lead]:
        text_query = f"{query} in {location}"
        leads: list[Lead] = []

        async with httpx.AsyncClient(timeout=30) as client:
            page_token: str | None = None
            page = 0

            while True:
                logger.info("Searching: %r (page %d)", text_query, page + 1)
                data = await self._request(client, text_query, page_token)

                for place in data.get("places", []):
                    # Skip businesses that have a website
                    if place.get("websiteUri"):
                        continue

                    place_id = place.get("id", "")
                    display_name = place.get("displayName", {})

                    lead = Lead(
                        id=f"google_places_{place_id}",
                        company_name=display_name.get("text", "Unknown"),
                        trade_category=query,
                        address=place.get("formattedAddress"),
                        phone=place.get("nationalPhoneNumber"),
                        has_website=False,
                        google_place_id=place_id,
                        business_status=place.get("businessStatus"),
                        metadata={"search_query": text_query, "location": location},
                    )
                    leads.append(lead)

                page_token = data.get("nextPageToken")
                page += 1
                if not page_token:
                    break

                await asyncio.sleep(REQUEST_DELAY)

        logger.info("Found %d leads without websites for %r", len(leads), text_query)
        return leads
