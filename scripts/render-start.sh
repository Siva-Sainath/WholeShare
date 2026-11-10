#!/bin/sh
# Render start script. The app writes its state to data/ and .scratch/ in the working directory.
# Render's filesystem is wiped on every deploy except the disk, so those folders live on the disk.
#   - The first boot copies the repository's versions in. Existing files are never overwritten, so settings, claims and pledges survive.
#   - The catalog files are product assets and are refreshed from the repository on every boot.
# Safe to run again on the same filesystem after a restart.
set -e

DISK="${RENDER_DISK_PATH:-/var/data}"

if [ -d "$DISK" ]; then
  SRC_DATA=data
  SRC_SCRATCH=.scratch
  [ -L data ] && SRC_DATA=data.repo
  [ -L .scratch ] && SRC_SCRATCH=.scratch.repo

  mkdir -p "$DISK/data" "$DISK/.scratch"
  [ -d "$SRC_DATA" ] && { cp -Rn "$SRC_DATA/." "$DISK/data/" 2>/dev/null || true; }
  [ -d "$SRC_SCRATCH" ] && { cp -Rn "$SRC_SCRATCH/." "$DISK/.scratch/" 2>/dev/null || true; }
  for asset in seeded-clans.json suppliers.json world-cities.json; do
    [ -f "$SRC_DATA/$asset" ] && { cp -f "$SRC_DATA/$asset" "$DISK/data/$asset" 2>/dev/null || true; }
  done
  if [ -d "$SRC_DATA/pools" ]; then
    mkdir -p "$DISK/data/pools"
    cp -Rf "$SRC_DATA/pools/." "$DISK/data/pools/" 2>/dev/null || true
  fi

  if [ ! -L data ]; then
    mv data data.repo
    ln -s "$DISK/data" data
  fi
  if [ ! -L .scratch ]; then
    if [ -d .scratch ]; then mv .scratch .scratch.repo; fi
    ln -s "$DISK/.scratch" .scratch
  fi
  echo "[render-start] state lives on $DISK"
else
  echo "[render-start] no disk at $DISK, state is not persisted"
fi

exec node src/web/server.js
