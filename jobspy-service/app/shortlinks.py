from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional
from urllib.parse import urlparse

import requests

# Hosts whose links are only redirects to the real ATS posting. Indeed hands
# out Greenhouse's grnh.se links for about a quarter of direct URLs; resolving
# them gives JobSync the job-boards.greenhouse.io URL it can dedupe against.
# An allowlist, so this service only ever follows links to known redirectors.
SHORTLINK_HOSTS = {"grnh.se"}
TIMEOUT_SECONDS = 5
MAX_WORKERS = 8

Resolver = Callable[[str], Optional[str]]


def is_shortlink(url: Optional[str]) -> bool:
    if not url:
        return False
    try:
        return (urlparse(url).hostname or "").lower() in SHORTLINK_HOSTS
    except ValueError:
        return False


def follow(url: str) -> Optional[str]:
    """The final URL after redirects, or None when it can't be reached or
    lands somewhere that isn't an http(s) page."""
    try:
        resp = requests.head(
            url,
            allow_redirects=True,
            timeout=TIMEOUT_SECONDS,
            headers={"User-Agent": "Mozilla/5.0 (compatible; JobSync-JobSpy)"},
        )
        final = resp.url
    except requests.RequestException:
        return None
    if urlparse(final).scheme not in ("http", "https") or is_shortlink(final):
        return None
    return final


def resolve_all(urls: list[str], resolver: Resolver = follow) -> dict[str, str]:
    """Resolves the shortlinks among `urls` concurrently. Links that fail are
    left out, so callers keep the original URL for them."""
    pending = sorted({u for u in urls if is_shortlink(u)})
    if not pending:
        return {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        results = list(pool.map(resolver, pending))
    return {src: dst for src, dst in zip(pending, results) if dst}
