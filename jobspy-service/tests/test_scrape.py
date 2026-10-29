from app.schemas import ScrapeRequest
from app.scrape import run_scrape
from conftest import FakeScraper, frame, row


def req(**kw):
    return ScrapeRequest(**{"searchTerms": ["Software Engineer"], **kw})


def test_passes_the_request_through_to_jobspy(no_resolve):
    scraper = FakeScraper({})
    run_scrape(req(searchTerms=["A", "B"], hoursOld=48, isRemote=False, jobType="contract",
                   resultsPerTerm=30, location="Huntsville, AL"),
               scraper=scraper, resolver=no_resolve)
    assert [c["search_term"] for c in scraper.calls] == ["A", "B"]
    call = scraper.calls[0]
    assert call["site_name"] == ["indeed"]
    assert call["hours_old"] == 48
    assert call["is_remote"] is False
    assert call["job_type"] == "contract"
    assert call["results_wanted"] == 30
    assert call["location"] == "Huntsville, AL"
    assert call["country_indeed"] == "usa"
    assert call["description_format"] == "html"


def test_one_failing_term_does_not_lose_the_others(no_resolve):
    scraper = FakeScraper({
        "A": RuntimeError("429 Too Many Requests"),
        "B": frame(row(id="b1", title="Backend Engineer")),
    })
    res = run_scrape(req(searchTerms=["A", "B"]), scraper=scraper, resolver=no_resolve)
    assert [j.title for j in res.jobs] == ["Backend Engineer"]
    assert [(e.searchTerm, e.reason) for e in res.errors] == [("A", "429 Too Many Requests")]


def test_jobspy_reported_errors_are_surfaced(no_resolve):
    scraper = FakeScraper({"A": frame(row(), errors=["Indeed: blocked"])})
    res = run_scrape(req(searchTerms=["A"]), scraper=scraper, resolver=no_resolve)
    assert len(res.jobs) == 1
    assert [e.reason for e in res.errors] == ["Indeed: blocked"]


def test_a_job_found_by_two_terms_is_returned_once_under_the_first(no_resolve):
    scraper = FakeScraper({
        "A": frame(row(id="same"), row(id="a2")),
        "B": frame(row(id="same"), row(id="b2")),
    })
    res = run_scrape(req(searchTerms=["A", "B"]), scraper=scraper, resolver=no_resolve)
    assert [(j.id, j.searchTerm) for j in res.jobs] == [("same", "A"), ("a2", "A"), ("b2", "B")]


def test_stops_starting_searches_after_the_deadline(no_resolve):
    ticks = iter([0, 1, 500, 500, 500, 500])
    scraper = FakeScraper({"A": frame(row(id="a"))})
    res = run_scrape(req(searchTerms=["A", "B", "C"]), scraper=scraper, resolver=no_resolve,
                     deadline_seconds=240, clock=lambda: next(ticks))
    assert [c["search_term"] for c in scraper.calls] == ["A"]
    assert [j.id for j in res.jobs] == ["a"]
    assert [(e.searchTerm, e.reason) for e in res.errors] == [
        ("B", "skipped: time budget used up"),
        ("C", "skipped: time budget used up"),
    ]


def test_greenhouse_shortlinks_are_resolved_and_others_left_alone():
    resolved = []

    def resolver(url):
        resolved.append(url)
        return {"https://grnh.se/ok": "https://job-boards.greenhouse.io/acme/jobs/1?gh_src=x"}.get(url)

    scraper = FakeScraper({"A": frame(
        row(id="1", job_url_direct="https://grnh.se/ok"),
        row(id="2", job_url_direct="https://grnh.se/dead"),
        row(id="3", job_url_direct="https://jobs.lever.co/acme/3"),
    )})
    res = run_scrape(req(searchTerms=["A"]), scraper=scraper, resolver=resolver)
    assert sorted(resolved) == ["https://grnh.se/dead", "https://grnh.se/ok"]
    assert [j.url for j in res.jobs] == [
        "https://job-boards.greenhouse.io/acme/jobs/1?gh_src=x",
        "https://grnh.se/dead",  # unresolvable: kept as given
        "https://jobs.lever.co/acme/3",
    ]


def test_rows_without_an_id_or_url_are_skipped(no_resolve):
    scraper = FakeScraper({"A": frame(row(id=None, job_url=None), row(id="ok"))})
    res = run_scrape(req(searchTerms=["A"]), scraper=scraper, resolver=no_resolve)
    assert [j.id for j in res.jobs] == ["ok"]
