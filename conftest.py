"""Root conftest for TurtleShell monorepo test suite.

Ensures early initialization of critical native libraries (e.g. OpenMP/scikit-learn)
to avoid Linux static TLS block allocation exhaustion when loaded lazily.
"""
try:
    import sklearn  # noqa: F401
except Exception:
    pass
