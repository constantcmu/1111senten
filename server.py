import http.server
import socketserver
import webbrowser
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"🚀 Server started at http://localhost:{PORT}")
        print(f"📂 Serving files from: {DIRECTORY}")
        print("💡 Press Ctrl+C to stop the server.")
        
        # Open browser automatically
        webbrowser.open(f"http://localhost:{PORT}/senten.html")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
            httpd.server_close()

if __name__ == "__main__":
    start_server()
