#!/bin/bash
# -------------------------------------------------------------
# BAS Face AI & Biometric Desktop Launcher for macOS
# -------------------------------------------------------------
cd "$(dirname "$0")/desktop-face-app" || exit 1

echo "⚡ Starting BAS Face AI Desktop Application..."
npm start
