#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

REPO_URL="${REPO_URL:-https://github.com/Susumeko/Pettangatari.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

echo "[Pettangatari] Preparing update..."

if ! command -v git >/dev/null 2>&1; then
  echo "[Pettangatari] Git was not found. Install Git and retry."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Pettangatari] npm was not found. Install Node.js 20+ and retry."
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "[Pettangatari] This folder is not a git repository."
  exit 1
fi

CURRENT_ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$CURRENT_ORIGIN" ]; then
  echo "[Pettangatari] Adding origin remote..."
  git remote add origin "$REPO_URL" || {
    echo "[Pettangatari] Failed to add the origin remote."
    exit 1
  }
elif [ "$CURRENT_ORIGIN" != "$REPO_URL" ]; then
  echo "[Pettangatari] Setting origin to $REPO_URL..."
  git remote set-url origin "$REPO_URL" || {
    echo "[Pettangatari] Failed to update the origin remote."
    exit 1
  }
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[Pettangatari] Local changes were detected."
  echo "[Pettangatari] Commit or stash your work before running the updater."
  git status --short
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "$REPO_BRANCH" ]; then
  echo "[Pettangatari] Switching to $REPO_BRANCH..."
  git checkout "$REPO_BRANCH" || {
    echo "[Pettangatari] Failed to switch to $REPO_BRANCH."
    exit 1
  }
fi

echo "[Pettangatari] Fetching latest changes..."
git fetch origin "$REPO_BRANCH" || {
  echo "[Pettangatari] Fetch failed."
  exit 1
}

echo "[Pettangatari] Pulling latest $REPO_BRANCH from origin..."
git pull --ff-only origin "$REPO_BRANCH" || {
  echo "[Pettangatari] Update failed."
  echo "[Pettangatari] The local branch could not be fast-forwarded automatically."
  exit 1
}

echo "[Pettangatari] Refreshing dependencies..."
npm install || {
  echo "[Pettangatari] npm install failed."
  exit 1
}

echo "[Pettangatari] Update complete."
