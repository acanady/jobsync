import logging
import time
from typing import Any, Callable, Optional

from jobspy import scrape_jobs

from . import shortlinks
from .mapping import clean, map_row
from .schemas import ScrapeError, ScrapeRequest, ScrapeResponse, ScrapedJob

log = logging.getLogger("jobspy-service")

# JobSync's run waits up to 6 minutes; stop starting new searches well before
# that so a slow board still returns what it found instead of timing out.
DEADLINE_SECONDS = 240

Scraper = Callable[..., Any]


def _reason(exc: Exception) -> str:
    text = str(exc).strip() or type(exc).__name__
    return text[:300]


def run_scrape(
    req: ScrapeRequest,
    scraper: Optional[Scraper] = None,
    resolver: Optional[shortlinks.Resolver] = None,
    deadline_seconds: float = DEADLINE_SECONDS,
    clock: Callable[[], float] = time.monotonic,
) -> ScrapeResponse:
    """One JobSpy search per (site, term), each isolated: a failing term is
    reported in `errors` and the others still return. Jobs found by several
    terms are returned once, under the first term that found them."""
    # Looked up per call (not bound as defaults) so tests can patch them.
    scraper = scraper or scrape_jobs
    resolver = resolver or shortlinks.follow
    started = clock()
    rows: list[tuple[dict, str]] = []
    errors: list[ScrapeError] = []
    seen: set[str] = set()

    for site in req.sites:
        for term in req.searchTerms:
            if clock() - started > deadline_seconds:
                errors.append(ScrapeError(site=site, searchTerm=term, reason="skipped: time budget used up"))
                continue
            try:
                df = scraper(
                    site_name=[site],
                    search_term=term,
                    location=req.location,
                    is_remote=req.isRemote,
                    hours_old=req.hoursOld,
                    job_type=req.jobType,
                    results_wanted=req.resultsPerTerm,
                    country_indeed="usa",
                    description_format="html",
                    verbose=0,
                )
            except Exception as exc:  # JobSpy raises plain Exceptions on blocks/429s
                log.warning("search failed site=%s term=%r: %s", site, term, exc)
                errors.append(ScrapeError(site=site, searchTerm=term, reason=_reason(exc)))
                continue

            for msg in (getattr(df, "attrs", {}) or {}).get("errors") or []:
                errors.append(ScrapeError(site=site, searchTerm=term, reason=str(msg)[:300]))

            for row in df.to_dict("records"):
                key = str(clean(row.get("id")) or clean(row.get("job_url")) or "")
                if not key or key in seen:
                    continue
                seen.add(key)
                rows.append((row, term))

    resolved = shortlinks.resolve_all(
        [str(clean(r.get("job_url_direct")) or "") for r, _ in rows], resolver
    )
    jobs: list[ScrapedJob] = []
    for row, term in rows:
        direct = clean(row.get("job_url_direct"))
        direct = resolved.get(direct, direct) if direct else None
        job = map_row(row, term, direct)
        if job:
            jobs.append(job)

    log.info("scrape done terms=%d jobs=%d errors=%d in %.1fs",
             len(req.searchTerms), len(jobs), len(errors), clock() - started)
    return ScrapeResponse(jobs=jobs, errors=errors)
