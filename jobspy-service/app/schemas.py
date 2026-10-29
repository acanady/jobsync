from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Indeed only for now. LinkedIn/Glassdoor/ZipRecruiter rate-limit or block
# far sooner; widen this list (and the JobSync-side enum) when adding them.
Site = Literal["indeed"]
JobType = Literal["fulltime", "parttime", "contract", "internship", "temporary"]


class ScrapeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # One JobSpy search per term. Exclusions are deliberately not accepted:
    # Indeed applies "-word" to the whole description, which dropped 13 of 18
    # wanted jobs in the spike. JobSync filters titles itself.
    searchTerms: list[str] = Field(min_length=1, max_length=20)
    sites: list[Site] = Field(default=["indeed"], min_length=1)
    location: str = Field(default="United States", max_length=100)
    isRemote: bool = True
    hoursOld: Optional[int] = Field(default=26, ge=1, le=720)
    jobType: Optional[JobType] = None
    resultsPerTerm: int = Field(default=100, ge=1, le=200)

    @field_validator("searchTerms")
    @classmethod
    def _clean_terms(cls, terms: list[str]) -> list[str]:
        cleaned: list[str] = []
        for term in terms:
            t = term.strip()
            if not t or len(t) > 100:
                raise ValueError("each search term must be 1-100 characters")
            if t.lower() not in (c.lower() for c in cleaned):
                cleaned.append(t)
        return cleaned

    @field_validator("sites")
    @classmethod
    def _unique_sites(cls, sites: list[str]) -> list[str]:
        return list(dict.fromkeys(sites))


class Salary(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    interval: Optional[str] = None  # yearly | monthly | weekly | daily | hourly
    currency: Optional[str] = None


class ScrapedJob(BaseModel):
    id: str
    site: str
    searchTerm: str
    title: str
    company: str
    location: str
    description: str  # HTML
    url: str  # the employer's own posting when known, else the board's page
    boardUrl: str
    postedDate: Optional[str] = None  # YYYY-MM-DD
    salary: Optional[Salary] = None
    jobType: Optional[str] = None
    isRemote: Optional[bool] = None


class ScrapeError(BaseModel):
    site: str
    searchTerm: str
    reason: str


class ScrapeResponse(BaseModel):
    jobs: list[ScrapedJob]
    errors: list[ScrapeError]
