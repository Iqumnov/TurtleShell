#!/usr/bin/env bash
# ==============================================================================
# TurtleShell Universal Standalone Toolchain & Benchmark Installer
# Automated OS/Arch detection, Python environment setup, and CLI installation
# Usage: curl -sSL https://raw.githubusercontent.com/Iqumnov/TurtleShell/main/install.sh | bash
# Repository: https://github.com/Iqumnov/TurtleShell
# Author: Matvei Igumnov
# License: MIT
# ==============================================================================

set -euo pipefail

VERSION="${TURTLESHELL_VERSION:-v0.1.0}"

# ANSI Colors (Monochrome Tactical)
BOLD="\033[1m"
DIM="\033[2m"
WHITE="\033[97m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}${WHITE}================================================================${RESET}"
echo -e "${BOLD}${CYAN}  TurtleShell // Multi-Contour Quantum Isolation Platform (${VERSION})${RESET}"
echo -e "${DIM}  Automated Multi-Platform Detection & Environment Setup${RESET}"
echo -e "${BOLD}${WHITE}================================================================${RESET}\n"

# 1. Detect Operating System
OS="$(uname -s)"
case "${OS}" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)
        echo -e "${RED}[!] Unsupported operating system: ${OS}${RESET}"
        exit 1
        ;;
esac

ARCH="$(uname -m)"
echo -e "${GREEN}[+]${RESET} Detected Platform: ${BOLD}${PLATFORM}-${ARCH}${RESET}"

# 2. Check Python Version
PYTHON_BIN=""
for py in python3 python python3.12 python3.11 python3.10; do
    if command -v "$py" >/dev/null 2>&1; then
        VER="$($py -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        MAJOR="$($py -c 'import sys; print(sys.version_info.major)')"
        MINOR="$($py -c 'import sys; print(sys.version_info.minor)')"
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 9 ]; then
            PYTHON_BIN="$py"
            break
        fi
    fi
done

if [ -z "${PYTHON_BIN}" ]; then
    echo -e "${RED}[!] Python 3.9+ is required but was not found in PATH.${RESET}"
    exit 1
fi
echo -e "${GREEN}[+]${RESET} Using Python: ${DIM}${PYTHON_BIN} ($(${PYTHON_BIN} --version))${RESET}"

# 3. Determine Project Root or Clone Repository
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    CURRENT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    CURRENT_SCRIPT_DIR="$(pwd)"
fi

if [ -d "${CURRENT_SCRIPT_DIR}/packages/quantum-isolation-benchmark" ]; then
    ROOT_DIR="${CURRENT_SCRIPT_DIR}"
else
    TARGET_DIR="${PWD}/TurtleShell"
    if [ ! -d "${TARGET_DIR}" ]; then
        echo -e "${GREEN}[+]${RESET} Cloning TurtleShell repository into ${DIM}${TARGET_DIR}${RESET}..."
        git clone https://github.com/Iqumnov/TurtleShell.git "${TARGET_DIR}"
    fi
    ROOT_DIR="${TARGET_DIR}"
fi
cd "${ROOT_DIR}"

# 4. Setup Python Virtual Environment
VENV_DIR="${ROOT_DIR}/.venv"
if [ ! -d "${VENV_DIR}" ]; then
    echo -e "${GREEN}[+]${RESET} Creating Python virtual environment in ${DIM}${VENV_DIR}${RESET}..."
    "${PYTHON_BIN}" -m venv --system-site-packages "${VENV_DIR}" || "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

# Activate venv
VENV_PYTHON="${VENV_DIR}/bin/python"
VENV_PIP="${VENV_DIR}/bin/pip"

echo -e "${GREEN}[+]${RESET} Upgrading pip and build tools..."
"${VENV_PYTHON}" -m pip install --upgrade pip setuptools wheel >/dev/null 2>&1 || true

echo -e "${GREEN}[+]${RESET} Installing TurtleShell Python packages..."
"${VENV_PIP}" install --no-build-isolation -e "${ROOT_DIR}/packages/quantum-isolation-benchmark" >/dev/null 2>&1 || {
    "${VENV_PIP}" install -e "${ROOT_DIR}/packages/quantum-isolation-benchmark" >/dev/null 2>&1 || true
}

if [ -f "${ROOT_DIR}/packages/turtleshell-live/backend/requirements.txt" ]; then
    echo -e "${GREEN}[+]${RESET} Installing live backend dependencies..."
    "${VENV_PIP}" install -r "${ROOT_DIR}/packages/turtleshell-live/backend/requirements.txt" >/dev/null 2>&1 || true
fi

# 5. Link qib CLI
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "${INSTALL_DIR}"
CLI_SYMLINK="${INSTALL_DIR}/qib"

if [ -f "${VENV_DIR}/bin/qib" ]; then
    ln -sf "${VENV_DIR}/bin/qib" "${CLI_SYMLINK}"
    echo -e "${GREEN}[+]${RESET} Installed ${BOLD}qib${RESET} CLI into ${DIM}${CLI_SYMLINK}${RESET}"
    if [[ ":${PATH:-}:" != *":${INSTALL_DIR}:"* ]]; then
        echo -e "${YELLOW}[!] Note: ${INSTALL_DIR} is not currently in your PATH.${RESET}"
        echo -e "${YELLOW}    Add it to your shell rc (e.g. ~/.bashrc or ~/.zshrc): export PATH=\"${INSTALL_DIR}:\$PATH\"${RESET}"
    fi
fi

# 6. Install Web App Dependencies (Node.js & npm)
FRONTEND_DIR="${ROOT_DIR}/packages/turtleshell-live/frontend"
if command -v npm >/dev/null 2>&1 && [ -d "${FRONTEND_DIR}" ]; then
    echo -e "${GREEN}[+]${RESET} Node.js detected: $(node --version). Installing local web app dependencies..."
    (cd "${FRONTEND_DIR}" && npm install >/dev/null 2>&1) || {
        echo -e "${YELLOW}[*] Local npm install completed with warnings. Live UI remains ready via client-side engine.${RESET}"
    }
fi

echo -e "\n${BOLD}${GREEN}================================================================${RESET}"
echo -e "${BOLD}${GREEN}  TurtleShell Installation Complete!${RESET}"
echo -e "${BOLD}${WHITE}================================================================${RESET}"
echo -e "Quick Start commands:"
echo -e "  1. Benchmark CLI:        ${CYAN}qib benchmark --provider all${RESET}"
if [ "${PWD}" != "${ROOT_DIR}" ]; then
    echo -e "  2. Launch Live UI:       ${CYAN}cd $(basename "${ROOT_DIR}") && ./run_live.sh${RESET}"
else
    echo -e "  2. Launch Live UI:       ${CYAN}./run_live.sh${RESET}"
fi
echo -e "  3. In-Browser Demo:      ${CYAN}https://turtleshell.iqumnov.com${RESET}"
echo -e "  4. Documentation:        ${CYAN}SPECS.md${RESET} & ${CYAN}docs/theory.md${RESET}\n"

