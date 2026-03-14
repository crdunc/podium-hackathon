import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "leads"

TRADE_CATEGORIES = [
    "hvac",
    "plumbing",
    "electrical",
    "lawn care",
    "landscaping",
    "roofing",
    "painting",
    "pest control",
    "carpet cleaning",
    "handyman",
    "garage door repair",
    "appliance repair",
    "tree service",
    "fencing",
    "concrete",
]

DEFAULT_CITIES = [
    "Salt Lake City, UT",
    "Provo, UT",
    "Ogden, UT",
    "St. George, UT",
    "Logan, UT",
    "Layton, UT",
    "Lehi, UT",
    "Boise, ID",
    "Pocatello, ID",
    "Twin Falls, ID",
]

REQUEST_DELAY = 1.0  # seconds between API requests
