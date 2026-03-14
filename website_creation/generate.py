"""Generate professional websites for scraped leads."""

import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader

# Add project root to path so we can import src
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.models import LeadCollection
from website_creation.trade_config import TRADE_CONFIG

load_dotenv(PROJECT_ROOT / ".env")

LEADS_DIR = PROJECT_ROOT / "data" / "leads"
SITES_DIR = PROJECT_ROOT / "sites"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
FORMSPREE_ID = os.getenv("FORMSPREE_FORM_ID", "YOUR_FORM_ID")
GITHUB_PAGES_BASE = "https://crdunc.github.io/podium-hackathon/sites"


def slugify(name: str) -> str:
    """Convert company name to URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug)
    return slug.strip("-")


def pick_testimonials(company_name: str, testimonials: list, count: int = 3) -> list:
    """Deterministically pick testimonials based on company name hash."""
    seed = int(hashlib.md5(company_name.encode()).hexdigest(), 16)
    indices = []
    n = len(testimonials)
    for i in range(count):
        indices.append((seed + i * 7) % n)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for idx in indices:
        if idx not in seen:
            seen.add(idx)
            unique.append(testimonials[idx])
    # Fill if we lost any to dedup
    for i in range(n):
        if len(unique) >= count:
            break
        if i not in seen:
            unique.append(testimonials[i])
            seen.add(i)
    return unique[:count]


def compute_variants(company_name: str) -> dict:
    """Deterministically pick layout variants based on company name hash."""
    h = int(hashlib.sha256(company_name.encode()).hexdigest(), 16)
    return {
        "hero_variant": h % 4,
        "nav_variant": (h >> 4) % 2,
        "services_variant": (h >> 8) % 3,
        "about_variant": (h >> 12) % 2,
        "testimonials_variant": (h >> 16) % 3,
        "form_variant": (h >> 20) % 2,
        "font_variant": (h >> 24) % 4,
        "tagline_variant": (h >> 28) % 6,
        "subtitle_variant": (h >> 32) % 6,
        "about_copy_variant": (h >> 36) % 4,
    }


def generate_sites():
    """Main generation function."""
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=False)
    template = env.get_template("base.html")

    SITES_DIR.mkdir(parents=True, exist_ok=True)

    # Load photo manifest if it exists
    manifest_path = SITES_DIR / "photo_manifest.json"
    photo_manifest = {}
    if manifest_path.exists():
        photo_manifest = json.loads(manifest_path.read_text())

    # Load all lead collections
    lead_files = sorted(LEADS_DIR.glob("*.json"))
    if not lead_files:
        print("No lead files found in data/leads/")
        return

    all_sites = []  # (city, company_name, slug, trade_category)
    used_slugs = {}  # slug -> count for dedup
    year = datetime.now().year
    skipped = 0

    # Track variant distribution for summary
    variant_counts = {"hero": {}, "services": {}, "testimonials": {}, "form": {}, "font": {}}

    for lead_file in lead_files:
        collection = LeadCollection.load(lead_file)
        city = collection.city

        for lead in collection.leads:
            # Skip non-operational or no-phone leads
            if lead.business_status and lead.business_status != "OPERATIONAL":
                skipped += 1
                continue
            if not lead.phone:
                skipped += 1
                continue

            trade = TRADE_CONFIG.get(lead.trade_category)
            if not trade:
                print(f"  Warning: No trade config for '{lead.trade_category}', skipping {lead.company_name}")
                skipped += 1
                continue

            # Generate slug with dedup
            base_slug = slugify(lead.company_name)
            if not base_slug:
                base_slug = "business"
            slug = base_slug
            if slug in used_slugs:
                used_slugs[slug] += 1
                slug = f"{base_slug}-{used_slugs[slug]}"
            else:
                used_slugs[slug] = 1

            # Pick testimonials
            testimonials = pick_testimonials(lead.company_name, trade["testimonials"])

            # Compute layout variants
            variants = compute_variants(lead.company_name)

            # Track distribution
            variant_counts["hero"][variants["hero_variant"]] = variant_counts["hero"].get(variants["hero_variant"], 0) + 1
            variant_counts["services"][variants["services_variant"]] = variant_counts["services"].get(variants["services_variant"], 0) + 1
            variant_counts["testimonials"][variants["testimonials_variant"]] = variant_counts["testimonials"].get(variants["testimonials_variant"], 0) + 1
            variant_counts["form"][variants["form_variant"]] = variant_counts["form"].get(variants["form_variant"], 0) + 1
            variant_counts["font"][variants["font_variant"]] = variant_counts["font"].get(variants["font_variant"], 0) + 1

            # Check for photo
            has_photo = bool(photo_manifest.get(slug))

            # Resolve copy variants
            tagline = trade["taglines"][variants["tagline_variant"] % len(trade["taglines"])]
            subtitle = trade["subtitles"][variants["subtitle_variant"] % len(trade["subtitles"])].format(city=city)
            about_copy = trade["about_paragraphs"][variants["about_copy_variant"] % len(trade["about_paragraphs"])]
            about_p1 = about_copy["p1"].format(company_name=lead.company_name, city=city, trade=trade["display_name"].lower())
            about_p2 = about_copy["p2"].format(company_name=lead.company_name, city=city, trade=trade["display_name"].lower())

            # Render
            html = template.render(
                company_name=lead.company_name,
                trade=trade,
                city=city,
                phone=lead.phone,
                address=lead.address or "",
                testimonials=testimonials,
                formspree_id=FORMSPREE_ID,
                year=year,
                has_photo=has_photo,
                tagline=tagline,
                subtitle=subtitle,
                about_p1=about_p1,
                about_p2=about_p2,
                **variants,
            )

            # Write site
            site_dir = SITES_DIR / slug
            site_dir.mkdir(parents=True, exist_ok=True)
            (site_dir / "index.html").write_text(html, encoding="utf-8")

            all_sites.append((city, lead.company_name, slug, lead.trade_category))

    # Generate index page
    generate_index(all_sites)

    print(f"\nGeneration complete!")
    print(f"  Sites generated: {len(all_sites)}")
    print(f"  Leads skipped:   {skipped}")
    print(f"  Output directory: {SITES_DIR}")
    print(f"\nVariant distribution:")
    for section, counts in variant_counts.items():
        dist = ", ".join(f"v{k}={v}" for k, v in sorted(counts.items()))
        print(f"  {section}: {dist}")
    print(f"\nGitHub Pages URL:  {GITHUB_PAGES_BASE}/{{slug}}/")


def generate_index(all_sites: list):
    """Generate the directory index page."""
    # Group by city
    cities = {}
    for city, company_name, slug, trade_category in all_sites:
        cities.setdefault(city, []).append((company_name, slug, trade_category))

    rows = []
    for city in sorted(cities.keys()):
        for company_name, slug, trade_category in sorted(cities[city], key=lambda x: x[0]):
            trade = TRADE_CONFIG.get(trade_category, {})
            icon = trade.get("icon", "")
            display_trade = trade.get("display_name", trade_category)
            rows.append(
                f'<tr class="border-b border-gray-100 hover:bg-gray-50">'
                f'<td class="px-4 py-3 font-medium"><a href="{slug}/" class="text-blue-600 hover:underline">{company_name}</a></td>'
                f'<td class="px-4 py-3">{icon} {display_trade}</td>'
                f'<td class="px-4 py-3">{city}</td>'
                f"</tr>"
            )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Sites Directory</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>tailwind.config = {{ theme: {{ extend: {{ fontFamily: {{ sans: ['Inter', 'system-ui', 'sans-serif'] }} }} }} }}</script>
</head>
<body class="bg-gray-50 min-h-screen font-sans antialiased">
    <div class="max-w-5xl mx-auto px-4 py-12">
        <h1 class="text-3xl font-bold mb-2">Generated Sites Directory</h1>
        <p class="text-gray-500 mb-8">{len(all_sites)} sites generated across {len(cities)} cities</p>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-100 text-gray-600 uppercase text-xs">
                    <tr>
                        <th class="px-4 py-3">Company</th>
                        <th class="px-4 py-3">Trade</th>
                        <th class="px-4 py-3">City</th>
                    </tr>
                </thead>
                <tbody>
                    {"".join(rows)}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>"""

    (SITES_DIR / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    generate_sites()
