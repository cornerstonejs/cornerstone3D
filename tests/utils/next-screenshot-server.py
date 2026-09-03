#!/usr/bin/env python3
import http.server
import json
import subprocess
import os
import signal

PORT = 8124
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
        ss_dir = os.path.join(TESTS_DIR, "screenshots", "chromium", "nextViewport")
        pairs = []
        for dirpath, dirs, files in sorted(os.walk(ss_dir)):
            cpu_files = [f for f in files if f.startswith("cpu-") and f.endswith(".png")]
            for cf in sorted(cpu_files):
                gpu_name = cf[4:]  # strip "cpu-" prefix
                if gpu_name in files:
                    rel = os.path.relpath(dirpath, ss_dir)
                    pairs.append({
                        "spec": rel,
                        "name": gpu_name.replace(".png", ""),
                        "gpu": os.path.join(rel, gpu_name),
                        "cpu": os.path.join(rel, cf),
                    })

            # Also find GPU-only screenshots (no CPU pair)
            non_cpu = [f for f in files if not f.startswith("cpu-") and f.endswith(".png")]
            for gf in sorted(non_cpu):
                cpu_name = "cpu-" + gf
                if cpu_name not in files:
                    rel = os.path.relpath(dirpath, ss_dir)
                    pairs.append({
                        "spec": rel,
                        "name": gf.replace(".png", ""),
                        "gpu": os.path.join(rel, gf),
                        "cpu": None,
                    })

        # Get git tracked files to mark status
        tracked = set()
        try:
            r = subprocess.run(
                ["git", "ls-files", "--", "tests/screenshots/chromium/nextViewport/"],
                cwd=REPO, capture_output=True, text=True
            )
            for line in r.stdout.strip().split("\n"):
                if line:
                    tracked.add(line.replace("tests/screenshots/chromium/nextViewport/", ""))
        except Exception:
            pass

        staged = set()
        try:
            r = subprocess.run(
                ["git", "diff", "--cached", "--name-only", "--", "tests/screenshots/chromium/nextViewport/"],
                cwd=REPO, capture_output=True, text=True
            )
            for line in r.stdout.strip().split("\n"):
                if line:
                    staged.add(line.replace("tests/screenshots/chromium/nextViewport/", ""))
        except Exception:
            pass

        for p in pairs:
            gpu_staged = p["gpu"] in staged or p["gpu"] in tracked
            cpu_staged = (p["cpu"] in staged or p["cpu"] in tracked) if p["cpu"] else True
            if gpu_staged and cpu_staged:
                p["status"] = "committed"
            elif p["gpu"] in staged or (p["cpu"] and p["cpu"] in staged):
                p["status"] = "staged"
            else:
                p["status"] = "new"

        self._json(200, pairs)

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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path == "/git-add":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            files = body.get("files", [])
            if not files:
                self._json(400, {"error": "missing files"})
                return
            added = []
            for filepath in files:
                full = os.path.normpath(os.path.join(TESTS_DIR, filepath.lstrip("/")))
                if not full.startswith(TESTS_DIR):
                    self._json(400, {"error": f"path outside tests dir: {filepath}"})
                    return
                if not os.path.isfile(full):
                    self._json(404, {"error": f"file not found: {filepath}"})
                    return
                added.append(full)
            try:
                result = subprocess.run(
                    ["git", "add"] + added,
                    cwd=REPO, capture_output=True, text=True
                )
                if result.returncode == 0:
                    self._json(200, {"ok": True, "files": files})
                else:
                    self._json(500, {"error": result.stderr.strip()})
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})


if __name__ == "__main__":
    kill_existing_server()
    server = http.server.HTTPServer(("", PORT), Handler)
    print(f"Serving on http://localhost:{PORT}/utils/next-screenshot-compare.html")
    server.serve_forever()
