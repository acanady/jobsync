# jobspy-service

A small FastAPI wrapper around [JobSpy](https://github.com/speedyapply/JobSpy)
that JobSync's JobSpy automations call to search Indeed. It runs as the
`jobspy` container from `docker-compose.override.yml` and publishes no port:
only the JobSync container reaches it, at `http://jobspy:8000`.

## API

`GET /health` returns `{"status": "ok", "jobspy": "<version>"}`.

`POST /scrape` runs one search per term and returns the jobs found:

```json
{
  "searchTerms": ["Software Engineer", "AI Engineer"],
  "location": "United States",
  "isRemote": true,
  "hoursOld": 26,
  "resultsPerTerm": 100
}
```

Each job has `title`, `company`, `location`, `description` (HTML), `url`
(the employer's own posting when Indeed has it, else the Indeed page),
`boardUrl`, `postedDate`, `salary`, `jobType`, `isRemote` and the
`searchTerm` that found it. A job found by several terms is returned once.
A term that fails (blocked, rate-limited) is listed in `errors` and the
other terms still return.

Title exclusions are not sent to Indeed on purpose: Indeed applies `-word`
to the whole description, which dropped most wanted jobs in testing.
JobSync filters titles after the search.

Greenhouse short links (`grnh.se`) are followed to the real posting URL so
JobSync can match them against jobs it already has.

## Tests

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
JOBSPY_LIVE=1 .venv/bin/python -m pytest -q -k live   # one real Indeed search
```

JobSpy is pinned in `requirements.txt`. To upgrade, bump the version,
rebuild (`docker compose up -d --build`) and rerun the live test.
