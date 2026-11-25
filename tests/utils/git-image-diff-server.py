#!/usr/bin/env python3
import http.server
import json
import mimetypes
import os
import signal
import subprocess
import urllib.parse


PORT = 8125
UTILS_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = os.path.dirname(UTILS_DIR)
REPO = os.path.dirname(TESTS_DIR)

IMAGE_EXTENSIONS = {
    ".avif",
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".tif",
    ".tiff",
    ".webp",
}


def kill_existing_server():
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{PORT}"],
            capture_output=True,
            text=True,
        )
        for pid in result.stdout.strip().split():
            if pid:
                os.kill(int(pid), signal.SIGKILL)
    except Exception:
        pass


def git(args, **kwargs):
    return subprocess.run(
        ["git", *args],
        cwd=REPO,
        capture_output=True,
        **kwargs,
    )


def is_image_path(path):
    return os.path.splitext(path.lower())[1] in IMAGE_EXTENSIONS


def is_safe_repo_path(path):
    if not path or os.path.isabs(path):
        return False
    normalized = os.path.normpath(path)
    return normalized != ".." and not normalized.startswith("../")


def full_repo_path(path):
    normalized = os.path.normpath(path)
    full = os.path.abspath(os.path.join(REPO, normalized))
    repo = os.path.abspath(REPO)
    return full if full == repo or full.startswith(repo + os.sep) else None


def get_head_paths():
    result = git(["ls-tree", "-r", "--name-only", "-z", "HEAD"])
    if result.returncode != 0:
        return set()

    text = result.stdout.decode("utf-8", "surrogateescape")
    return {p for p in text.split("\0") if p}


def parse_status():
    result = git(
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    if result.returncode != 0:
        return []

    fields = result.stdout.decode("utf-8", "surrogateescape").split("\0")
    entries = []
    i = 0

    while i < len(fields):
        entry = fields[i]
        if not entry:
            break

        xy = entry[:2]
        path = entry[3:]
        before_path = path

        if "R" in xy or "C" in xy:
            i += 1
            if i < len(fields) and fields[i]:
                before_path = fields[i]

        entries.append(
            {
                "xy": xy,
                "path": path,
                "beforePath": before_path,
            }
        )
        i += 1

    return entries


def status_label(xy):
    index_status, worktree_status = xy[0], xy[1]

    if xy == "??":
        return "untracked"
    if "R" in xy:
        return "renamed"
    if "C" in xy:
        return "copied"
    if index_status == "A" or worktree_status == "A":
        return "added"
    if index_status == "D" or worktree_status == "D":
        return "deleted"
    if index_status == "M" or worktree_status == "M":
        return "modified"
    if index_status == "T" or worktree_status == "T":
        return "type changed"
    return xy.strip() or "changed"


def collect_changes():
    head_paths = get_head_paths()
    changes = []

    for entry in parse_status():
        path = entry["path"]
        before_path = entry["beforePath"]
        xy = entry["xy"]

        if not (is_image_path(path) or is_image_path(before_path)):
            continue
        if not is_safe_repo_path(path) or not is_safe_repo_path(before_path):
            continue

        full_after = full_repo_path(path)
        has_after = bool(full_after and os.path.isfile(full_after))
        has_before = before_path in head_paths and is_image_path(before_path)

        if not has_before and not has_after:
            continue

        index_changed = xy[0] not in (" ", "?")
        worktree_changed = xy[1] not in (" ", "?")
        fully_staged = index_changed and not worktree_changed
        label = status_label(xy)

        changes.append(
            {
                "path": path,
                "beforePath": before_path,
                "name": os.path.basename(path),
                "directory": os.path.dirname(path) or ".",
                "status": label,
                "xy": xy,
                "staged": fully_staged,
                "hasBefore": has_before,
                "hasAfter": has_after,
            }
        )

    return sorted(changes, key=lambda c: (c["directory"], c["name"], c["path"]))


def image_mime(path):
    if path.lower().endswith(".svg"):
        return "image/svg+xml"
    return mimetypes.guess_type(path)[0] or "application/octet-stream"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=TESTS_DIR, **kwargs)

    def end_headers(self):
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        )
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path in ("/", "/git-image-diff", "/git-image-diff.html"):
            self.path = "/utils/git-image-diff.html"
            return super().do_GET()

        if parsed.path == "/api/changes":
            return self._serve_changes()

        if parsed.path == "/image/before":
            return self._serve_before(parsed)

        if parsed.path == "/image/after":
            return self._serve_after(parsed)

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/git-add":
            return self._json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            return self._json(400, {"error": "invalid json"})

        raw_files = body.get("files")
        if raw_files is None:
            raw_files = [body.get("path"), body.get("beforePath")]
        files = []
        for file_path in raw_files:
            if file_path and file_path not in files:
                files.append(file_path)

        if not files:
            return self._json(400, {"error": "missing files"})

        allowed = set()
        for change in collect_changes():
            allowed.add(change["path"])
            allowed.add(change["beforePath"])

        for file_path in files:
            if not is_safe_repo_path(file_path):
                return self._json(400, {"error": f"path outside repo: {file_path}"})
            if file_path not in allowed:
                return self._json(
                    400,
                    {"error": f"path is not an uncommitted image change: {file_path}"},
                )

        result = git(["add", "--", *files], text=True)
        if result.returncode != 0:
            return self._json(500, {"error": result.stderr.strip()})

        return self._json(200, {"ok": True, "files": files})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _serve_changes(self):
        self._json(200, collect_changes())

    def _serve_before(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        path = query.get("path", [""])[0]

        if not is_safe_repo_path(path) or not is_image_path(path):
            return self._json(400, {"error": "invalid image path"})

        result = git(["show", f"HEAD:{path}"])
        if result.returncode != 0:
            return self._json(404, {"error": f"not found in HEAD: {path}"})

        self._bytes(200, result.stdout, image_mime(path))

    def _serve_after(self, parsed):
        query = urllib.parse.parse_qs(parsed.query)
        path = query.get("path", [""])[0]

        if not is_safe_repo_path(path) or not is_image_path(path):
            return self._json(400, {"error": "invalid image path"})

        full = full_repo_path(path)
        if not full or not os.path.isfile(full):
            return self._json(404, {"error": f"not found in working tree: {path}"})

        with open(full, "rb") as image:
            self._bytes(200, image.read(), image_mime(path))

    def _json(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, code, body, content_type):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    kill_existing_server()
    server = http.server.HTTPServer(("", PORT), Handler)
    print(f"Serving on http://localhost:{PORT}/utils/git-image-diff.html")
    server.serve_forever()
