import logging
from importlib.metadata import version

from fastapi import FastAPI

from .scrape import run_scrape
from .schemas import ScrapeRequest, ScrapeResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="JobSync JobSpy service", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "jobspy": version("python-jobspy")}


# A plain `def`, so FastAPI runs the blocking JobSpy calls in its threadpool.
@app.post("/scrape", response_model=ScrapeResponse)
def scrape(req: ScrapeRequest) -> ScrapeResponse:
    return run_scrape(req)
