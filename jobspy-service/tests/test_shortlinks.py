import pytest
import requests

from app import shortlinks


@pytest.mark.parametrize("url,expected", [
    ("https://grnh.se/abc", True),
    ("http://GRNH.SE/abc", True),
    ("https://grnh.se.evil.example/abc", False),
    ("https://evilgrnh.se/abc", False),
    ("https://sub.grnh.se/abc", False),
    ("https://evil.example/grnh.se", False),
    ("https://job-boards.greenhouse.io/acme/jobs/1", False),
    ("", False),
    (None, False),
])
def test_is_shortlink_matches_the_host_exactly(url, expected):
    assert shortlinks.is_shortlink(url) is expected


class FakeResponse:
    def __init__(self, url):
        self.url = url


def test_follow_returns_the_final_url(monkeypatch):
    monkeypatch.setattr(shortlinks.requests, "head",
                        lambda url, **kw: FakeResponse("https://job-boards.greenhouse.io/acme/jobs/1"))
    assert shortlinks.follow("https://grnh.se/x") == "https://job-boards.greenhouse.io/acme/jobs/1"


@pytest.mark.parametrize("final", ["https://grnh.se/still-short", "ftp://example.com/x"])
def test_follow_rejects_unusable_destinations(monkeypatch, final):
    monkeypatch.setattr(shortlinks.requests, "head", lambda url, **kw: FakeResponse(final))
    assert shortlinks.follow("https://grnh.se/x") is None


def test_follow_returns_none_on_network_errors(monkeypatch):
    def boom(url, **kw):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(shortlinks.requests, "head", boom)
    assert shortlinks.follow("https://grnh.se/x") is None


def test_resolve_all_only_follows_each_shortlink_once():
    calls = []

    def resolver(url):
        calls.append(url)
        return url + "/final"

    out = shortlinks.resolve_all(
        ["https://grnh.se/a", "https://grnh.se/a", "https://jobs.lever.co/x"], resolver)
    assert calls == ["https://grnh.se/a"]
    assert out == {"https://grnh.se/a": "https://grnh.se/a/final"}
