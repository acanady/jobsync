import math
from datetime import date, datetime
from typing import Any, Optional

from .schemas import Salary, ScrapedJob


def clean(value: Any) -> Any:
    """pandas hands back NaN/NaT for missing cells; JSON wants null."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if type(value).__name__ in ("NaTType", "NAType"):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _text(value: Any) -> Optional[str]:
    v = clean(value)
    return None if v is None else str(v).strip()


def _date(value: Any) -> Optional[str]:
    v = clean(value)
    if v is None:
        return None
    if isinstance(v, (date, datetime)):
        return v.strftime("%Y-%m-%d")
    return str(v)[:10]


def _salary(row: dict) -> Optional[Salary]:
    lo, hi = clean(row.get("min_amount")), clean(row.get("max_amount"))
    if lo is None and hi is None:
        return None
    return Salary(
        min=float(lo) if lo is not None else None,
        max=float(hi) if hi is not None else None,
        interval=_text(row.get("interval")),
        currency=_text(row.get("currency")),
    )


def _bool(value: Any) -> Optional[bool]:
    v = clean(value)
    return None if v is None else bool(v)


def map_row(row: dict, search_term: str, direct_url: Optional[str]) -> Optional[ScrapedJob]:
    """One JobSpy dataframe row -> the service's job shape. Rows missing the
    fields JobSync cannot save without (title, company, a link) are dropped."""
    title, company = _text(row.get("title")), _text(row.get("company"))
    board_url = _text(row.get("job_url"))
    if not title or not company or not board_url:
        return None
    return ScrapedJob(
        id=_text(row.get("id")) or board_url,
        site=_text(row.get("site")) or "unknown",
        searchTerm=search_term,
        title=title,
        company=company,
        location=_text(row.get("location")) or "",
        description=_text(row.get("description")) or "",
        url=direct_url or board_url,
        boardUrl=board_url,
        postedDate=_date(row.get("date_posted")),
        salary=_salary(row),
        jobType=_text(row.get("job_type")),
        isRemote=_bool(row.get("is_remote")),
    )
