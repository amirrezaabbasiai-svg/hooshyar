#!/usr/bin/env python3
"""Tiny preview server: serves hooshyar-prototype.html at / (and the repo dir)."""
import http.server, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.path = '/hooshyar-prototype.html'
        return super().do_GET()
    def log_message(self, *a):
        pass
http.server.ThreadingHTTPServer(('0.0.0.0', 8080), H).serve_forever()
