import os

import pytest
from fastapi.testclient import TestClient

from app import main, scrape
from conftest import FakeScraper, frame, row

client = TestClient(main.app)


def test_health_reports_the_pinned_jobspy_version():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "jobspy": "1.4.1"}


def test_scrape_rejects_invalid_requests():
    assert client.post("/scrape", json={"searchTerms": []}).status_code == 422
    assert client.post("/scrape", json={"searchTerms": ["x"], "sites": ["linkedin"]}).status_code == 422


def test_scrape_returns_json_jobs(monkeypatch):
    fake = FakeScraper({"Software Engineer": frame(row())})
    monkeypatch.setattr(scrape, "scrape_jobs", fake)
    monkeypatch.setattr(scrape.shortlinks, "follow", lambda url: None)
    res = client.post("/scrape", json={"searchTerms": ["Software Engineer"]})
    assert res.status_code == 200
    body = res.json()
    assert body["errors"] == []
    assert [(j["title"], j["company"], j["url"]) for j in body["jobs"]] == [
        ("Software Engineer", "Acme", "https://jobs.lever.co/acme/abc")]
    assert fake.calls[0]["search_term"] == "Software Engineer"


@pytest.mark.skipif(os.environ.get("JOBSPY_LIVE") != "1", reason="hits Indeed; set JOBSPY_LIVE=1")
def test_live_indeed_search():
    res = client.post("/scrape", json={"searchTerms": ["Software Engineer"], "resultsPerTerm": 10})
    assert res.status_code == 200
    body = res.json()
    assert body["jobs"], body["errors"]
    assert all(j["site"] == "indeed" and j["title"] and j["url"] for j in body["jobs"])
