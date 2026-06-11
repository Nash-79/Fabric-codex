#!/bin/bash
set -e

# Install Python backend dependencies
pip install -q -r backend/requirements.txt

# Install frontend Node dependencies
cd frontend && npm install --silent && cd ..

# Create / migrate the SQLite database (idempotent — safe on every merge)
cd backend && python - <<'EOF'
import sys, os
sys.path.insert(0, ".")
os.environ.setdefault("DATABASE_URL", "sqlite:///./fabric_atlas.db")
from app.db import init_db
init_db()
print("DB init_db() completed.")
EOF
cd ..
