#!/usr/bin/env bash
# EventLens — Local Development Setup
# Usage: ./scripts/setup.sh
#
# This script:
#   1. Checks prerequisites (Node.js, npm)
#   2. Installs dependencies
#   3. Creates .env from .env.example (if needed)
#   4. Validates required environment variables
#   5. Prints next steps (Supabase schema, optional face-api)
#
# @TheTechMargin 2026

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()    { echo -e "${RED}✗${NC}  $1"; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       EventLens — Setup Script       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Prerequisites ──────────────────────────────────────
info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  fail "Node.js is not installed. Install it from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18+ required (found v$(node -v))"
  exit 1
fi
success "Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
  fail "npm is not installed"
  exit 1
fi
success "npm $(npm -v)"

# ── Step 2: Install dependencies ───────────────────────────────
info "Installing dependencies..."
npm install --silent
success "Dependencies installed"

# ── Step 3: Environment file ───────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn "Created .env from .env.example — fill in your keys before running"
  else
    fail ".env.example not found"
    exit 1
  fi
else
  success ".env already exists"
fi

# ── Step 4: Validate required env vars ─────────────────────────
info "Checking environment variables..."

MISSING=()

check_var() {
  local val
  val=$(grep "^$1=" .env 2>/dev/null | cut -d= -f2-)
  if [ -z "$val" ]; then
    MISSING+=("$1")
  fi
}

check_var "GOOGLE_API_KEY"
check_var "GOOGLE_DRIVE_FOLDER_ID"
check_var "GEMINI_API_KEY"
check_var "NEXT_PUBLIC_SUPABASE_URL"
check_var "SUPABASE_SERVICE_ROLE_KEY"
check_var "APP_PASSWORD"
check_var "ADMIN_API_SECRET"

if [ ${#MISSING[@]} -gt 0 ]; then
  warn "Missing environment variables in .env:"
  for var in "${MISSING[@]}"; do
    echo -e "     ${YELLOW}→${NC} $var"
  done
  echo ""
else
  success "All required environment variables set"
fi

# ── Step 5: Next steps ─────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Next Steps${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  1. Fill in any missing .env values"
echo ""
echo "  2. Set up your Supabase database:"
echo "     → Go to your Supabase project SQL Editor"
echo "     → Paste and run: supabase/schema.sql"
echo "     (This creates all tables, indexes, and functions)"
echo ""
echo "  3. Start the dev server:"
echo "     npm run dev"
echo ""
echo "  4. Open the admin panel to run the pipeline:"
echo "     http://localhost:3000/admin"
echo ""
echo -e "  ${YELLOW}Optional:${NC} Face matching"
echo "     → Deploy services/face-api/ to Railway/Render"
echo "     → Set FACE_API_URL and FACE_API_SECRET in .env"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
