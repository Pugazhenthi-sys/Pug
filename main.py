"""
SSS Billing — Desktop App Entry Point
Auto-detects paths, works from any directory.
"""
import sys
import os
import threading
import time

# ── Path helpers ──────────────────────────────────────────────────────────────
# Always resolve paths relative to THIS file, not the working directory
THIS_DIR = os.path.dirname(os.path.abspath(__file__))

def resource_path(relative):
    """Works in dev and inside PyInstaller .exe"""
    base = getattr(sys, '_MEIPASS', THIS_DIR)
    return os.path.join(base, relative)

def data_path(filename):
    """Data files (billing.db) live beside the .exe in production,
       or beside main.py in dev — never inside the bundle."""
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = THIS_DIR
    return os.path.join(base, filename)

# Set DB path before importing anything that uses it
os.environ["SSS_DB_PATH"] = data_path("billing.db")

# Add our directory to sys.path so api.py and database.py are always found
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)
if getattr(sys, 'frozen', False) and sys._MEIPASS not in sys.path:
    sys.path.insert(0, sys._MEIPASS)

# ── Imports ───────────────────────────────────────────────────────────────────
def fail(msg, hint=""):
    print(f"\n[ERROR] {msg}")
    if hint:
        print(f"  Fix: {hint}")
    input("\nPress Enter to close...")
    sys.exit(1)

try:
    import uvicorn
except ImportError:
    fail("uvicorn not installed", "pip install uvicorn")

try:
    import webview
except ImportError:
    fail("pywebview not installed", "pip install pywebview")

try:
    from api import app as fastapi_app
except Exception as e:
    import traceback
    traceback.print_exc()
    fail(f"Could not load api.py: {e}")

# ── Backend ───────────────────────────────────────────────────────────────────
PORT = 18432

def start_backend():
    try:
        config = uvicorn.Config(
            fastapi_app,
            host="127.0.0.1",
            port=PORT,
            log_level="error",
            loop="asyncio",
        )
        server = uvicorn.Server(config)
        server.run()
    except OSError as e:
        if "address already in use" in str(e).lower() or "10048" in str(e):
            print(f"[ERROR] Port {PORT} already in use. Close other SSS Billing windows.")
        else:
            print(f"[ERROR] Backend crashed: {e}")
    except Exception as e:
        print(f"[ERROR] Backend crashed: {e}")

def wait_for_backend(timeout=30):
    import urllib.request
    url = f"http://127.0.0.1:{PORT}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  SSS Billing — Starting")
    print(f"  App dir : {THIS_DIR}")
    print(f"  Data dir: {data_path('')}")
    print(f"  DB path : {os.environ['SSS_DB_PATH']}")
    print("=" * 50)

    print(f"\n[1/3] Starting backend on port {PORT}...")
    t = threading.Thread(target=start_backend, daemon=True)
    t.start()

    print("[2/3] Waiting for backend to be ready...")
    if not wait_for_backend(timeout=30):
        fail(
            f"Backend did not start within 30 seconds.",
            f"Port {PORT} may be in use. Close other SSS Billing windows and retry."
        )

    print("[3/3] Opening app window...")
    try:
        webview.create_window(
            title="SSS Billing — Shree Sai Saravanabhava Traders",
            url=f"http://127.0.0.1:{PORT}",
            width=1280,
            height=800,
            min_size=(1024, 650),
            resizable=True,
            confirm_close=True,
        )
        webview.start(debug=False)
        print("Window closed. Goodbye.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        fail(f"Could not open window: {e}", "pip install pywebview --upgrade")
