# Contributing to TurtleShell & Quantum Isolation Benchmark

Thank you for your interest in contributing to **TurtleShell**! We welcome contributions from researchers, software engineers, and quantum physicists.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Iqumnov/TurtleShell.git
   cd TurtleShell
   ```

2. Set up virtual environment and install backend dependencies:
   ```bash
   cd packages/turtleshell-live/backend
   python -m venv .venv
   source .venv/bin/activate  # Or `.venv\Scripts\activate` on Windows
   pip install -r requirements.txt
   ```

3. Run pytest suite:
   ```bash
   python -m pytest
   ```

## Pull Request Guidelines

- Ensure all existing tests pass (`python -m pytest`).
- Add tests for any new features or bug fixes.
- Follow PEP 8 style guidelines for Python code.
- Write clear, descriptive commit messages.

## License

By contributing, you agree that your contributions will be licensed under the repository's MIT License.
