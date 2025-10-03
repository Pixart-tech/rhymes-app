"""Application helpers for the Rhymes backend service.

This package provides modular building blocks that the legacy ``server``
module re-exports so that existing imports continue to function.  The
structure keeps the deployment entry-point stable while allowing the codebase
to grow in a maintainable fashion.
"""

from . import config, rhymes, svg_processing

__all__ = [
    "config",
    "rhymes",
    "svg_processing",
]

