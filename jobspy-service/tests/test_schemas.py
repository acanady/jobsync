import pytest
from pydantic import ValidationError

from app.schemas import ScrapeRequest


def test_defaults_match_the_spike_settings():
    req = ScrapeRequest(searchTerms=["Software Engineer"])
    assert req.sites == ["indeed"]
    assert req.location == "United States"
    assert req.isRemote is True
    assert req.hoursOld == 26
    assert req.resultsPerTerm == 100


@pytest.mark.parametrize("site", ["linkedin", "glassdoor", "zip_recruiter", "google"])
def test_only_indeed_is_accepted(site):
    with pytest.raises(ValidationError):
        ScrapeRequest(searchTerms=["x"], sites=[site])


def test_exclusions_are_not_accepted():
    # Pushing exclusions to Indeed filters on descriptions, not titles; the
    # service refuses the field so no caller can turn that on by accident.
    with pytest.raises(ValidationError):
        ScrapeRequest(searchTerms=["x"], excludeTitles=["Senior"])


@pytest.mark.parametrize("terms", [[], [""], ["   "], ["x" * 101], [f"t{i}" for i in range(21)]])
def test_rejects_bad_search_terms(terms):
    with pytest.raises(ValidationError):
        ScrapeRequest(searchTerms=terms)


def test_terms_are_trimmed_and_deduplicated_case_insensitively():
    req = ScrapeRequest(searchTerms=[" Software Engineer ", "software engineer", "AI Engineer"])
    assert req.searchTerms == ["Software Engineer", "AI Engineer"]


@pytest.mark.parametrize("field,value", [("hoursOld", 0), ("hoursOld", 721),
                                         ("resultsPerTerm", 0), ("resultsPerTerm", 201)])
def test_numeric_bounds(field, value):
    with pytest.raises(ValidationError):
        ScrapeRequest(searchTerms=["x"], **{field: value})


def test_hours_old_can_be_turned_off():
    assert ScrapeRequest(searchTerms=["x"], hoursOld=None).hoursOld is None
