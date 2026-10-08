#!/usr/bin/env python3
"""Exercise real TTY onboarding against a local mock API (Linux/macOS).
Run after npm run build: python3 scripts/test-terminal.py
No production accounts, browser authorization or publication are used.
"""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import tempfile
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
CALLS = []
STEPS = [
    {"id": "basics", "label": "Basics", "hint": ""},
    {"id": "description", "label": "Description", "hint": ""},
    {"id": "links", "label": "Links", "hint": ""},
    {"id": "media", "label": "Brand & media", "hint": ""},
    {"id": "builder", "label": "Builder", "hint": ""},
    {"id": "review", "label": "Review", "hint": ""},
]

class API(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        CALLS.append(("GET", self.path, None))
        types = {}
        for kind in ["product", "agent", "hackathon"]:
            steps = list(STEPS)
            if kind == "agent":
                steps.insert(-2, {"id": "passport", "label": "Agent passport", "hint": ""})
            types[kind] = {"steps": steps, "categories": ["Developer Tools"], "fields": [
                {"key": "name", "label": "Name", "step": "basics", "required": True},
                {"key": "founderName", "label": "Builder name", "step": "builder", "required": True},
            ]}
        self.reply({"contractVersion": 1, "types": types, "media": {"maxItems": 8, "maxScreenshots": 1, "maxVideos": 1}})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        CALLS.append(("POST", self.path, body))
        if body.get("action") == "validate":
            return self.reply({"valid": True})
        self.reply({"id": "mock-id", "slug": "mock-build", "status": "pending_review", "href": "/mock-build"})

class Terminal:
    def __init__(self, cwd, token="apc_mock", width=80, extra_env=None):
        self.master, self.slave = pty.openpty()
        self.resize(width)
        env = dict(os.environ, TERM="xterm-256color", ARCAPUSH_TOKEN=token,
                   ARCAPUSH_API_URL=BASE, XDG_CONFIG_HOME=str(cwd), APPDATA=str(cwd))
        env.pop("NO_COLOR", None)
        env.update(extra_env or {})
        self.process = subprocess.Popen(["node", str(ROOT / "dist/cli.js")], cwd=cwd, env=env,
                                        stdin=self.slave, stdout=self.slave, stderr=self.slave)
        self.output = b""

    def resize(self, width):
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 60, width, 0, 0))
        if hasattr(self, "process"):
            self.process.send_signal(signal.SIGWINCH)

    def expect(self, text, timeout=10):
        target = text.encode()
        deadline = time.monotonic() + timeout
        while target not in self.output:
            if time.monotonic() > deadline:
                raise AssertionError(f"Missing {text!r}: {self.output.decode(errors='replace')}")
            if select.select([self.master], [], [], .1)[0]:
                self.output += os.read(self.master, 65536)
        return self.output.decode(errors="replace")

    def send(self, data):
        self.output = b""
        os.write(self.master, data)

    def finish(self, expected=0):
        assert self.process.wait(timeout=10) == expected
        assert termios.tcgetattr(self.slave)[3] & termios.ICANON, "TTY not restored"
        os.close(self.master)
        os.close(self.slave)
        self.master = self.slave = None

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait()
        for fd in [self.master, self.slave]:
            if fd is not None:
                os.close(fd)
        self.master = self.slave = None

server = ThreadingHTTPServer(("127.0.0.1", 0), API)
BASE = f"http://127.0.0.1:{server.server_port}"
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="arcapush-tty-") as temp:
        root = Path(temp)
        # All type selections enter the same live wizard and require review approval.
        for kind, keys in [("product", b"\r"), ("agent", b"\x1b[C\r"), ("hackathon", b"\t\t\r")]:
            directory = root / kind
            directory.mkdir()
            terminal = Terminal(directory)
            try:
                screen = terminal.expect("Arrow keys to choose")
                assert "Choose (1)" not in screen and "Review and submit" in screen
                assert "█" in screen
                terminal.send(keys)
                terminal.expect("Name *:")
                terminal.send(b"Demo build\r")
                for media in ["logo", "cover", "screenshot", "video"]:
                    terminal.expect(f"{media} URL or file (optional):")
                    terminal.send(b"\r")
                if kind == "agent":
                    terminal.expect("Add optional agent passport details?")
                    terminal.send(b"n\r")
                terminal.expect("Builder name *:")
                terminal.send(b"Test builder\r")
                terminal.expect("Submit this listing to Arcapush?")
                draft = json.loads((directory / ".arcapush-submission.json").read_text())
                assert draft["type"] == kind
                assert not any(call[2] and call[2].get("action") == "submit" for call in CALLS)
                terminal.send(b"n\r")
                terminal.expect("Cancelled. Your local draft is saved.")
                terminal.finish()
            finally:
                terminal.close()
        print("PASS: all 3 type choices, details, media, optional passport, review cancellation and saved drafts")

        # A saved draft bypasses the type selector and retains its listing type.
        terminal = Terminal(root / "agent")
        try:
            terminal.expect("Resume the saved submission?")
            terminal.send(b"y\r")
            terminal.expect("Name * (Demo build):")
            terminal.send(b"\x03")
            terminal.process.wait(timeout=10)
        finally:
            terminal.close()
        print("PASS: saved draft resume")

        for key in [b"\x1b", b"\x03"]:
            terminal = Terminal(root, width=40)
            before = len(CALLS)
            try:
                screen = terminal.expect("Esc to cancel")
                assert "█" in screen
                terminal.resize(100)
                terminal.send(key)
                terminal.expect("Cancelled. Nothing was submitted.")
                terminal.finish(130)
                assert len(CALLS) == before
            finally:
                terminal.close()
        print("PASS: narrow screen, resize, Escape and Ctrl+C restore terminal without API requests")

        terminal = Terminal(root, token="")
        before = len(CALLS)
        try:
            screen = terminal.expect("Connect your Arcapush account? [Y/n]")
            assert "01" in screen and "Choose what you are shipping" in screen
            terminal.send(b"n\r")
            terminal.finish()
            assert len(CALLS) == before
        finally:
            terminal.close()
        print("PASS: fresh account starts at stage 1; declining does not start browser authorization")
finally:
    server.shutdown()
    server.server_close()
