"""Serves the admin web panel at /admin (three static files, no build step).

The page is locked down with a strict Content-Security-Policy: it may only load its own
script/style and talk to this same server, can't be framed, and isn't indexed by search engines.
Data access is still protected by the API: every /api/v1/admin call requires an admin token.
"""
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

STATIC = Path(__file__).parent / "admin_static"
CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
HEADERS = {"Content-Security-Policy": CSP, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"}

router = APIRouter(include_in_schema=False)


@router.get("/admin")
async def admin_index() -> FileResponse:
    return FileResponse(STATIC / "index.html", media_type="text/html", headers=HEADERS)


@router.get("/admin/app.js")
async def admin_js() -> FileResponse:
    return FileResponse(STATIC / "app.js", media_type="text/javascript", headers=HEADERS)


@router.get("/admin/app.css")
async def admin_css() -> FileResponse:
    return FileResponse(STATIC / "app.css", media_type="text/css", headers=HEADERS)
