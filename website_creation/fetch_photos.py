"""Fetch business photos from Google Places API for generated sites."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.models import LeadCollection
from website_creation.generate import slugify

load_dotenv(PROJECT_ROOT / ".env")

LEADS_DIR = PROJECT_ROOT / "data" / "leads"
SITES_DIR = PROJECT_ROOT / "sites"
API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
MANIFEST_PATH = SITES_DIR / "photo_manifest.json"

PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
PHOTO_MEDIA_URL = "https://places.googleapis.com/v1/{photo_name}/media"


async def get_photo_reference(client: httpx.AsyncClient, place_id: str) -> str | None:
    """Get the first photo reference for a place."""
    try:
        resp = await client.get(
            PLACE_DETAILS_URL.format(place_id=place_id),
            headers={
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": "photos",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        photos = data.get("photos", [])
        if photos:
            return photos[0].get("name")
    except Exception as e:
        print(f"    Error fetching details for {place_id}: {e}")
    return None


async def download_photo(client: httpx.AsyncClient, photo_name: str, output_path: Path) -> bool:
    """Download a photo from Places API."""
    try:
        resp = await client.get(
            PHOTO_MEDIA_URL.format(photo_name=photo_name),
            params={
                "maxWidthPx": 800,
                "maxHeightPx": 600,
                "key": API_KEY,
            },
            follow_redirects=True,
        )
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "image" in content_type:
            output_path.write_bytes(resp.content)
            return True
    except Exception as e:
        print(f"    Error downloading photo: {e}")
    return False


async def fetch_all_photos():
    """Fetch photos for all leads that have generated sites."""
    if not API_KEY:
        print("Error: GOOGLE_MAPS_API_KEY not set in .env")
        return

    # Load existing manifest to skip already-fetched photos
    manifest = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())

    # Build slug -> (place_id, company_name) mapping
    lead_files = sorted(LEADS_DIR.glob("*.json"))
    targets = []
    used_slugs = {}

    for lead_file in lead_files:
        collection = LeadCollection.load(lead_file)
        for lead in collection.leads:
            if lead.business_status and lead.business_status != "OPERATIONAL":
                continue
            if not lead.phone:
                continue
            if not lead.google_place_id:
                continue

            base_slug = slugify(lead.company_name)
            if not base_slug:
                base_slug = "business"
            slug = base_slug
            if slug in used_slugs:
                used_slugs[slug] += 1
                slug = f"{base_slug}-{used_slugs[slug]}"
            else:
                used_slugs[slug] = 1

            site_dir = SITES_DIR / slug
            if not site_dir.exists():
                continue

            # Skip if already fetched
            if slug in manifest:
                continue

            targets.append((slug, lead.google_place_id, lead.company_name))

    print(f"Fetching photos for {len(targets)} businesses (skipping {len(manifest)} already done)...")

    fetched = 0
    failed = 0
    semaphore = asyncio.Semaphore(5)  # Limit concurrent requests

    async with httpx.AsyncClient(timeout=30) as client:
        async def process(slug: str, place_id: str, name: str):
            nonlocal fetched, failed
            async with semaphore:
                photo_name = await get_photo_reference(client, place_id)
                if not photo_name:
                    manifest[slug] = None  # No photo available
                    failed += 1
                    return

                output_path = SITES_DIR / slug / "photo.jpg"
                success = await download_photo(client, photo_name, output_path)
                if success:
                    manifest[slug] = "photo.jpg"
                    fetched += 1
                    print(f"  [{fetched}] {name}")
                else:
                    manifest[slug] = None
                    failed += 1

                # Rate limit
                await asyncio.sleep(0.2)

        # Process in batches
        batch_size = 20
        for i in range(0, len(targets), batch_size):
            batch = targets[i:i + batch_size]
            tasks = [process(slug, pid, name) for slug, pid, name in batch]
            await asyncio.gather(*tasks)
            # Save manifest after each batch
            MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))

    # Final save
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))

    print(f"\nDone! Photos fetched: {fetched}, No photo available: {failed}")
    print(f"Manifest saved to: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(fetch_all_photos())
