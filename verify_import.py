import sys
import os

# Add the project root to the Python path so the 'backend' package can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from backend.app import auth
    print("Successfully imported backend.app.auth")
except IndentationError as e:
    print(f"IndentationError encountered: {e}")
except Exception as e:
    print(f"An unexpected error occurred: {e}")