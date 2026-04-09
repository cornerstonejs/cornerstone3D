#!/usr/bin/env python3
import http.server
import json
import subprocess
import os
import signal
import urllib.parse

PORT = 8123
# tests/utils/ -> tests/
TESTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if os.path.basename(os.path.dirname(os.path.abspath(__file__))) == "utils" else os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(TESTS_DIR)


def kill_existing_server():
    """Kill any process already listening on PORT."""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{PORT}"],
            capture_output=True, text=True
        )
        pids = result.stdout.strip().split()
        for pid in pids:
            if pid:
                os.kill(int(pid), signal.SIGKILL)
    except Exception:
        pass

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=TESTS_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/pairs":
            self._serve_pairs()
        else:
            super().do_GET()

    def _serve_pairs(self):
        ss_dir = os.path.join(TESTS_DIR, "screenshots", "chromium")
        # Find all pairs
        pairs = []
        for dirpath, dirs, files in sorted(os.walk(ss_dir)):
            compat_files = [f for f in files if f.startswith("compatibility-viewport-v2-") and f.endswith(".png")]
            for cf in sorted(compat_files):
                base_name = cf.replace("compatibility-viewport-v2-", "")
                if base_name in files:
                    rel = os.path.relpath(dirpath, ss_dir)
                    pairs.append({
                        "spec": rel,
                        "name": base_name.replace(".png", ""),
                        "legacy": os.path.join(rel, base_name),
                        "compat": os.path.join(rel, cf),
                    })

        # Get git state: tracked files, staged files
        tracked = set()
        try:
            r = subprocess.run(
                ["git", "ls-files", "--", "tests/screenshots/chromium/"],
                cwd=REPO, capture_output=True, text=True
            )
            for line in r.stdout.strip().split("\n"):
                if "compatibility-viewport-v2" in line:
                    tracked.add(line.replace("tests/screenshots/chromium/", ""))
        except Exception:
            pass

        staged = set()
        try:
            r = subprocess.run(
                ["git", "diff", "--cached", "--name-only", "--", "tests/screenshots/chromium/"],
                cwd=REPO, capture_output=True, text=True
            )
            for line in r.stdout.strip().split("\n"):
                if "compatibility-viewport-v2" in line:
                    staged.add(line.replace("tests/screenshots/chromium/", ""))
        except Exception:
            pass

        for p in pairs:
            if p["compat"] in staged:
                p["status"] = "staged"
            elif p["compat"] in tracked:
                p["status"] = "committed"
            else:
                p["status"] = "new"

        self._json(200, pairs)

    def do_POST(self):
        if self.path == "/git-add":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            filepath = body.get("file")
            if not filepath:
                self._json(400, {"error": "missing file"})
                return
            # Resolve relative to screenshots dir and ensure it stays inside
            full = os.path.normpath(os.path.join(TESTS_DIR, filepath.lstrip("/")))
            if not full.startswith(TESTS_DIR):
                self._json(400, {"error": "path outside tests dir"})
                return
            if not os.path.isfile(full):
                self._json(404, {"error": f"file not found: {filepath}"})
                return
            try:
                result = subprocess.run(
                    ["git", "add", full],
                    cwd=REPO, capture_output=True, text=True
                )
                if result.returncode == 0:
                    self._json(200, {"ok": True, "file": filepath})
                else:
                    self._json(500, {"error": result.stderr.strip()})
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    kill_existing_server()
    server = http.server.HTTPServer(("", PORT), Handler)
    print(f"Serving on http://localhost:{PORT}/utils/screenshot-compare.html")
    server.serve_forever()
