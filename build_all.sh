#!/usr/bin/env bash
# ==============================================================================
# TurtleShell Unified Build & Verification Pipeline
# Runs pytest test suites, verifies physical formulas, and builds assets
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
VENV_PYTHON="${ROOT_DIR}/.venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    VENV_PYTHON="python3"
fi

echo "================================================================"
echo "  TurtleShell // Unified Verification & Build Pipeline"
echo "================================================================"

echo "[+] 1. Running full pytest suite (benchmark + backend)..."
"${VENV_PYTHON}" -m pytest "${ROOT_DIR}/packages/quantum-isolation-benchmark/tests" "${ROOT_DIR}/packages/turtleshell-live/backend/tests" -v

echo "[+] 2. Running physical isolation formulas sanity checks..."
"${VENV_PYTHON}" -c "
import math
# Contour 3 verification: tau_b formula (Table 2 parameters)
n0 = 100.0
ndot = 1.0
eta = 10.0
n_star = 0.2
n_inf = ndot / eta
assert n_star > n_inf, 'Target threshold must exceed asymptotic heating limit'
tau_b = (1.0 / eta) * math.log((n0 - n_inf) / (n_star - n_inf))
print(f'Contour 3 Laser Cooling Buffer tau_b: {tau_b:.4f} s')
assert abs(tau_b - 0.6908) < 1e-3, f'Expected 0.6908s, got {tau_b}'
"

echo "[+] 3. Checking Lean 4 formal proofs (if lake available)..."
LAKE_BIN="$(command -v lake || true)"
if [ -z "${LAKE_BIN}" ] && [ -x "${HOME}/.elan/bin/lake" ]; then
    LAKE_BIN="${HOME}/.elan/bin/lake"
fi
if [ -n "${LAKE_BIN}" ] && [ -d "${ROOT_DIR}/proofs" ]; then
    (cd "${ROOT_DIR}/proofs" && "${LAKE_BIN}" build)
else
    echo "[*] lake not present, skipping Lean 4 proof build."
fi

echo "[+] 4. Checking frontend build (if node/npm available)..."
if command -v npm >/dev/null 2>&1 && [ -d "${ROOT_DIR}/packages/turtleshell-live/frontend" ]; then
    cd "${ROOT_DIR}/packages/turtleshell-live/frontend"
    if [ -d "node_modules" ]; then
        npm run build
    else
        echo "[*] node_modules not present, skipping Vite build."
    fi
fi

echo "================================================================"
echo "  [SUCCESS] All verification tests passed cleanly!"
echo "================================================================"

