import math
from datetime import date

import pandas as pd
import pytest

NAN = math.nan


def row(**overrides):
    """A JobSpy dataframe row as Indeed returns it, with the columns the
    service reads. Override any field per test."""
    base = {
        "id": "in-1",
        "site": "indeed",
        "job_url": "https://www.indeed.com/viewjob?jk=1",
        "job_url_direct": "https://jobs.lever.co/acme/abc",
        "title": "Software Engineer",
        "company": "Acme",
        "location": "Remote, USA",
        "date_posted": date(2026, 10, 27),
        "job_type": "fulltime",
        "interval": "yearly",
        "min_amount": 120000.0,
        "max_amount": 150000.0,
        "currency": "USD",
        "is_remote": True,
        "description": "<p>Build things</p>",
    }
    base.update(overrides)
    return base


def frame(*rows, errors=None):
    df = pd.DataFrame(list(rows))
    if errors:
        df.attrs["errors"] = errors
    return df


class FakeScraper:
    """Stands in for jobspy.scrape_jobs: returns a canned frame per search
    term (or raises), and records every call's keyword arguments."""

    def __init__(self, by_term):
        self.by_term = by_term
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        result = self.by_term.get(kwargs["search_term"], frame())
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture
def no_resolve():
    def resolver(url):
        raise AssertionError(f"unexpected shortlink resolution of {url}")
    return resolver
