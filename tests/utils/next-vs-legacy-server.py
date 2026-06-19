#!/usr/bin/env python3
"""Serves tests/compat-diff/ and exposes a small /git-add endpoint so the
next-vs-legacy viewer can stage screenshots straight from the browser.

Why: the static HTML built by next-vs-legacy-build.py is fine for eyeballing
diffs, but staging is a separate copy-paste step. Run this server instead of
opening the file directly and the Git Add button in the toolbar lights up,
each successful stage hides the pair from the sidebar so you can iterate
through the remaining ones.

Usage:
  python3 tests/utils/next-vs-legacy-build.py    # (re)build the viewer
  python3 tests/utils/next-vs-legacy-server.py   # serve at :8125
"""
from __future__ import annotations

import http.server
import json
import os
import signal
import subprocess
import sys
from pathlib import Path

PORT = 8125
REPO = Path(__file__).resolve().parents[2]
DIFF_ROOT = REPO / "tests" / "compat-diff"


def kill_existing_server() -> None:
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{PORT}"], capture_output=True, text=True
        )
        for pid in result.stdout.strip().split():
            if pid:
                os.kill(int(pid), signal.SIGKILL)
    except Exception:
        pass


def is_path_inside(target: Path, parent: Path) -> bool:
    try:
        target.resolve().relative_to(parent.resolve())
        return True
    except (ValueError, FileNotFoundError):
        return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIFF_ROOT), **kwargs)

    def end_headers(self):
        # Avoid cached PNGs lingering after a baseline regen.
        self.send_header(
            "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"
        )
        super().end_headers()

    def do_GET(self):  # noqa: N802
        if self.path == "/api/staged":
            self._serve_staged()
            return
        if self.path == "/api/health":
            self._send_json({"ok": True})
            return
        super().do_GET()

    def do_POST(self):  # noqa: N802
        if self.path == "/api/git-add":
            self._handle_git_add()
            return
        self.send_error(404, "Not found")

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _resolve_repo_paths(self, items: list[str]) -> list[Path] | None:
        resolved: list[Path] = []
        for item in items:
            candidate = (REPO / item).resolve()
            if not is_path_inside(candidate, REPO / "tests" / "screenshots"):
                return None
            if not candidate.exists():
                return None
            resolved.append(candidate)
        return resolved

    def _handle_git_add(self) -> None:
        data = self._read_json_body()
        files = data.get("files") or []
        if not isinstance(files, list) or not files:
            self._send_json({"ok": False, "error": "no files"}, 400)
            return
        resolved = self._resolve_repo_paths(files)
        if resolved is None:
            self._send_json(
                {"ok": False, "error": "paths must live under tests/screenshots"},
                400,
            )
            return
        try:
            result = subprocess.run(
                ["git", "add", "--", *[str(p) for p in resolved]],
                cwd=str(REPO),
                capture_output=True,
                text=True,
                check=True,
            )
            self._send_json({"ok": True, "stdout": result.stdout, "files": files})
        except subprocess.CalledProcessError as exc:
            self._send_json(
                {"ok": False, "error": exc.stderr or exc.stdout or str(exc)}, 500
            )

    def _serve_staged(self) -> None:
        try:
            result = subprocess.run(
                ["git", "diff", "--cached", "--name-only", "--", "tests/screenshots/"],
                cwd=str(REPO),
                capture_output=True,
                text=True,
                check=True,
            )
            staged = [
                line.strip() for line in result.stdout.splitlines() if line.strip()
            ]
            self._send_json({"ok": True, "staged": staged})
        except subprocess.CalledProcessError as exc:
            self._send_json(
                {"ok": False, "error": exc.stderr or exc.stdout or str(exc)}, 500
            )


def main() -> None:
    if not DIFF_ROOT.exists():
        sys.exit(
            f"missing {DIFF_ROOT}; run tests/utils/next-vs-legacy-build.py first"
        )
    kill_existing_server()
    print(f"Serving {DIFF_ROOT.relative_to(REPO)} at http://localhost:{PORT}/")
    print(f"Open:   http://localhost:{PORT}/next-vs-legacy.html")
    print("Press Ctrl+C to stop.")
    with http.server.HTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
