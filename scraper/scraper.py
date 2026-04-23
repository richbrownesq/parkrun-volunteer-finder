#!/usr/bin/env python3
"""
Scrapes parkrun.org.uk/futureroster/ pages and writes a vacancy summary to
data/volunteers.json for the frontend to consume.

Table structure on the page:
  Row 0 (header): [empty] | date1 | date2 | ...
  Row N (role):   role_name | volunteer_name_or_empty | ...

Usage:
    python scraper.py                  # normal run
    python scraper.py --debug oriam    # dump parsed roster to stdout and exit
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.parkrun.org.uk/{slug}/futureroster/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
}


def fetch_page(slug: str) -> str:
    url = BASE_URL.format(slug=slug)
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.text


def parse_date(text: str) -> str | None:
    """Parse 'DD Month YYYY' → 'YYYY-MM-DD'. Returns None if unparseable."""
    for fmt in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_roster(html: str) -> list[dict]:
    """
    Returns a list of dicts per upcoming date:
      {
        "date": "YYYY-MM-DD",
        "vacant_roles": ["Role A", ...],
        "filled_count": int,
        "total_count": int,
      }
    Only dates with at least one vacancy are included.
    """
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table", id="rosterTable")
    if table is None:
        return []

    rows = table.find_all("tr")
    if not rows:
        return []

    # Row 0: extract dates (skip first cell which is the role-name header)
    header_cells = rows[0].find_all(["th", "td"])
    dates = []
    for cell in header_cells[1:]:
        parsed = parse_date(cell.get_text(strip=True))
        dates.append(parsed)  # None if unparseable; we'll skip those columns

    # Build per-date vacancy maps: date_index → {vacant: [], filled: 0}
    date_data: list[dict] = [{"vacant": [], "filled": 0} for _ in dates]

    for row in rows[1:]:
        cells = row.find_all(["th", "td"])
        if not cells:
            continue
        role_name = cells[0].get_text(strip=True)
        if not role_name:
            continue
        for i, cell in enumerate(cells[1:]):
            if i >= len(dates) or dates[i] is None:
                continue
            value = cell.get_text(strip=True)
            if value:
                date_data[i]["filled"] += 1
            else:
                date_data[i]["vacant"].append(role_name)

    result = []
    for i, d in enumerate(date_data):
        if dates[i] is None:
            continue
        total = d["filled"] + len(d["vacant"])
        if total == 0:
            continue
        if d["vacant"]:
            result.append(
                {
                    "date": dates[i],
                    "vacant_roles": d["vacant"],
                    "filled_count": d["filled"],
                    "total_count": total,
                }
            )

    return result


def scrape_event(event: dict) -> dict:
    slug = event["slug"]
    name = event["name"]
    print(f"  Scraping {name}…", flush=True)
    try:
        html = fetch_page(slug)
        upcoming = parse_roster(html)
        return {
            "name": name,
            "slug": slug,
            "url": BASE_URL.format(slug=slug),
            "upcoming_with_vacancies": upcoming,
            "scrape_ok": True,
            "error": None,
        }
    except Exception as exc:
        print(f"  [ERROR] {name}: {exc}", file=sys.stderr)
        return {
            "name": name,
            "slug": slug,
            "url": BASE_URL.format(slug=slug),
            "upcoming_with_vacancies": [],
            "scrape_ok": False,
            "error": str(exc),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--debug",
        metavar="SLUG",
        help="Parse one event and print the result to stdout, then exit",
    )
    parser.add_argument(
        "--config",
        default=str(Path(__file__).parent.parent / "config.json"),
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).parent.parent / "data" / "volunteers.json"),
    )
    args = parser.parse_args()

    with open(args.config) as f:
        config = json.load(f)

    if args.debug:
        slug = args.debug
        html = fetch_page(slug)
        result = parse_roster(html)
        print(json.dumps(result, indent=2))
        return

    events = config["events"]
    results = []
    for i, event in enumerate(events):
        result = scrape_event(event)
        results.append(result)
        if i < len(events) - 1:
            time.sleep(2)

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "events": results,
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {args.output}")
    for r in results:
        count = len(r["upcoming_with_vacancies"])
        status = f"{count} date(s) with vacancies" if r["scrape_ok"] else f"ERROR: {r['error']}"
        print(f"  {r['name']}: {status}")


if __name__ == "__main__":
    main()
