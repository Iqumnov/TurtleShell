# Quickstart Guide

## 1. Running the Live Dashboard

### Option A: Local Development
```bash
# Start backend
cd packages/turtleshell-live/backend
python -m uvicorn app.main:app --reload --port 8000

# Start frontend (in a separate terminal)
cd packages/turtleshell-live/frontend
npm run dev
```

### Option B: Docker Compose
```bash
docker-compose up --build
```
Access the dashboard at `http://localhost:5173`.

---

## 2. Using the Benchmark CLI (`qib`)

Install the framework locally:
```bash
pip install -e .
```

Run benchmarks across providers:
```bash
qib benchmark --provider all --output report.md
```

Generate QuTiP verification report:
```bash
qib verify-qutip
```
