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
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    kill_existing_server()
    server = http.server.HTTPServer(("", PORT), Handler)
    print(f"Serving on http://localhost:{PORT}/utils/next-screenshot-compare.html")
    server.serve_forever()
