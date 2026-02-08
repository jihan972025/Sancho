"""PyInstaller entry point for Sancho backend."""
import sys
import os

if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    sys.path.insert(0, base_dir)

from backend.main import app
import uvicorn

uvicorn.run(app, host="127.0.0.1", port=8765)
