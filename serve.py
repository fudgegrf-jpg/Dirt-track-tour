#!/usr/bin/env python3
"""Release-only HTTP server. No project history, references, tests or listings."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
ROOT = Path(__file__).resolve().parent
class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js':'application/javascript', '.mjs':'application/javascript', '.wasm':'application/wasm', '.webmanifest':'application/manifest+json', '.json':'application/json'}
    def send_head(self):
        try:
            path = unquote(urlsplit(self.path).path)
            target = (ROOT / (path.lstrip('/') or 'index.html')).resolve()
            relative = target.relative_to(ROOT)
            allowed = str(relative) in {'index.html','manifest.webmanifest'} or (relative.parts[0] in {'js','css','vendor','icons'} and target.suffix.lower() in {'.js','.mjs','.css','.ttf','.woff','.woff2','.png','.svg','.ico','.wasm','.json'})
            if not allowed or any(p.startswith('.') for p in relative.parts) or not target.is_file():
                self.send_error(404); return None
        except (ValueError, OSError, IndexError):
            self.send_error(404); return None
        return super().send_head()
    def list_directory(self, path):
        self.send_error(404); return None
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-DTT-Release','mobile-v1')
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8080);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(GameHandler,directory=str(ROOT)))
    print(f'Dirt Track Tour release server: http://localhost:{args.port}',flush=True)
    server.serve_forever()
