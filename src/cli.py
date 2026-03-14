from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from src.config import DEFAULT_CITIES, TRADE_CATEGORIES
from src.pipeline import scrape_city


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape trade business leads without websites")
    parser.add_argument("--city", type=str, help="City to scrape (e.g. 'Salt Lake City, UT')")
    parser.add_argument("--trade", type=str, help="Single trade category to scrape")
    parser.add_argument("--all-trades", action="store_true", help="Scrape all trade categories")
    parser.add_argument("--all", action="store_true", help="Scrape all cities and all trades")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if args.all:
        cities = DEFAULT_CITIES
        trades = TRADE_CATEGORIES
    elif args.city:
        cities = [args.city]
        if args.trade:
            trades = [args.trade]
        elif args.all_trades:
            trades = TRADE_CATEGORIES
        else:
            print("Specify --trade <name> or --all-trades", file=sys.stderr)
            sys.exit(1)
    else:
        print("Specify --city <name> or --all", file=sys.stderr)
        sys.exit(1)

    for city in cities:
        result = asyncio.run(scrape_city(city, trades))
        print(f"{city}: {len(result.leads)} total leads")


if __name__ == "__main__":
    main()
