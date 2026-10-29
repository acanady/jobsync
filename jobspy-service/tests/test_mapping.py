import pandas as pd

from app.mapping import map_row
from conftest import NAN, row


def test_maps_a_full_row():
    job = map_row(row(), "Software Engineer", "https://jobs.lever.co/acme/abc")
    assert job.model_dump() == {
        "id": "in-1",
        "site": "indeed",
        "searchTerm": "Software Engineer",
        "title": "Software Engineer",
        "company": "Acme",
        "location": "Remote, USA",
        "description": "<p>Build things</p>",
        "url": "https://jobs.lever.co/acme/abc",
        "boardUrl": "https://www.indeed.com/viewjob?jk=1",
        "postedDate": "2026-10-27",
        "salary": {"min": 120000.0, "max": 150000.0, "interval": "yearly", "currency": "USD"},
        "jobType": "fulltime",
        "isRemote": True,
    }


def test_falls_back_to_the_board_url_without_a_direct_link():
    job = map_row(row(job_url_direct=NAN), "t", None)
    assert job.url == "https://www.indeed.com/viewjob?jk=1"


def test_missing_cells_become_null_not_nan():
    job = map_row(
        row(min_amount=NAN, max_amount=NAN, interval=NAN, currency=NAN,
            job_type=NAN, is_remote=NAN, date_posted=pd.NaT, location=NAN, description=NAN),
        "t", None,
    )
    assert job.salary is None
    assert job.jobType is None
    assert job.isRemote is None
    assert job.postedDate is None
    assert job.location == ""
    assert job.description == ""


def test_one_sided_salary_is_kept():
    job = map_row(row(max_amount=NAN), "t", None)
    assert job.salary.min == 120000.0 and job.salary.max is None


def test_is_remote_false_is_not_confused_with_missing():
    assert map_row(row(is_remote=False), "t", None).isRemote is False


def test_rows_jobsync_cannot_save_are_dropped():
    assert map_row(row(title=NAN), "t", None) is None
    assert map_row(row(company="  "), "t", None) is None
    assert map_row(row(job_url=NAN), "t", None) is None
