import socket
import json
import os
from datetime import datetime

RUNTIME_DIR = os.path.dirname(os.path.abspath(__file__))
PORT_FILE = os.path.join(RUNTIME_DIR, "port.json")

def get_free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

def save_port(port):
    data = {
        "service": "quant_engine",
        "host": "127.0.0.1",
        "port": port,
        "startedAt": datetime.utcnow().isoformat()
    }
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    with open(PORT_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[PortManager] Saved port {port} to {PORT_FILE}")

def load_port():
    try:
        with open(PORT_FILE, "r") as f:
            return json.load(f).get("port")
    except Exception:
        return None
