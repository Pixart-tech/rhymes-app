import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

try:
    from app import auth
    print("Successfully imported backend.app.auth")
except IndentationError as e:
    print(f"IndentationError encountered: {e}")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
