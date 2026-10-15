#!/usr/bin/env bash
# Copies the MediaPipe runtime and pose model into public/ so the app serves
# them itself (ADR-002). Both folders are gitignored: model files are never
# committed. The model comes from dev/ (see dev/landmark_test.py for its source).
# Usage: npm run models   (also runs before `npm run dev`)
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
dev="$here/../dev"

mkdir -p "$here/public/mediapipe/wasm" "$here/public/models"
cp "$here"/node_modules/@mediapipe/tasks-vision/wasm/* "$here/public/mediapipe/wasm/"

missing=0
for model in pose_landmarker_lite.task; do
  if [[ -f "$dev/$model" ]]; then
    cp "$dev/$model" "$here/public/models/"
  else
    echo "warning: $dev/$model not found; measuring photos won't work until it's there" >&2
    missing=1
  fi
done

[[ $missing -eq 0 ]] && echo "Copied MediaPipe runtime and models into public/"
exit 0
