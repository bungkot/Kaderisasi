import os
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import URLError

ALLOWED_HOSTS = set(filter(None, os.environ.get("ALLOWED_HOSTS", "").split(",")))
RATE_LIMIT_RPS = float(os.environ.get("RATE_LIMIT_RPS", "10"))
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(1024 * 1024)))

lock = threading.Lock()
counters = {"allowed": 0, "denied": 0, "bytes_out": 0}
buckets = {}


def allow(host):
    return any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_HOSTS)


def rate_limited(client):
    now = time.monotonic()
    with lock:
        tokens, last = buckets.get(client, (RATE_LIMIT_RPS, now))
        tokens = min(RATE_LIMIT_RPS, tokens + (now - last) * RATE_LIMIT_RPS)
        allowed = tokens >= 1
        if allowed:
            tokens -= 1
        buckets[client] = (tokens, now)
    return not allowed


class GuardHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def send_bytes(self, status, body, content_type="text/plain; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self.send_bytes(200, b"ok\n")
            return
        if self.path == "/metrics":
            with lock:
                lines = [
                    "# HELP guard_requests_allowed_total Allowed requests",
                    "# TYPE guard_requests_allowed_total counter",
                    f"guard_requests_allowed_total {counters['allowed']}",
                    "# HELP guard_requests_denied_total Denied requests",
                    "# TYPE guard_requests_denied_total counter",
                    f"guard_requests_denied_total {counters['denied']}",
                    "# HELP guard_bytes_out_total Response bytes forwarded",
                    "# TYPE guard_bytes_out_total counter",
                    f"guard_bytes_out_total {counters['bytes_out']}",
                ]
            self.send_bytes(200, ("\n".join(lines) + "\n").encode())
            return
        self.forward()

    def do_POST(self):
        self.forward()

    def do_PUT(self):
        self.forward()

    def do_PATCH(self):
        self.forward()

    def do_DELETE(self):
        self.forward()

    def forward(self):
        client = self.client_address[0]
        parsed = urlsplit(self.path)
        host = parsed.netloc or ""
        hostname = host.split(":")[0]

        if not allow(hostname) or rate_limited(client):
            with lock:
                counters["denied"] += 1
            self.send_bytes(403, b"denied by guard\n")
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > MAX_BODY_BYTES:
            with lock:
                counters["denied"] += 1
            self.send_bytes(413, b"body too large\n")
            return

        body = self.rfile.read(length) if length else None
        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in ("host", "proxy-connection", "connection", "content-length"):
                headers[key] = value

        request = Request(self.path, data=body, headers=headers, method=self.command)
        try:
            with urlopen(request, timeout=15) as response:
                payload = response.read(MAX_BODY_BYTES)
                content_type = response.headers.get("Content-Type", "application/octet-stream")
                with lock:
                    counters["allowed"] += 1
                    counters["bytes_out"] += len(payload)
                self.send_bytes(response.status, payload, content_type)
        except (URLError, OSError) as error:
            with lock:
                counters["denied"] += 1
            self.send_bytes(502, str(error).encode())


def main():
    server = ThreadingHTTPServer(("0.0.0.0", 8080), GuardHandler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
