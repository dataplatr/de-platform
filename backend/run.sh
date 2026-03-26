#!/usr/bin/env bash
# Run from the backend/ directory
conda run -n next uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
