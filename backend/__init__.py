"""Backend package initialization for FastAPI application."""

# Expose commonly used modules for convenient imports when the package is loaded.
from . import app  # noqa: F401

__all__ = ["app"]
