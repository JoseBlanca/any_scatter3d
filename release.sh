#!/usr/bin/env bash
set -euo pipefail

# From repo root
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== Clean python build artifacts =="
rm -rf dist build src/*.egg-info

echo "== Build frontend bundle (vite) =="
pushd frontend >/dev/null
npm ci
npm run build
popd >/dev/null

echo "== Sanity check: bundle exists =="
test -f src/scatter3d/static/scatter3d.js
ls -lh src/scatter3d/static/scatter3d.js

echo "== Run python tests (optional but recommended) =="
uv run pytest

echo "== Build wheel/sdist =="
uv build

echo "== Verify wheel contains bundled JS =="
python - <<'PY'
import glob, zipfile, sys
whls = glob.glob("dist/*.whl")
if not whls:
    print("No wheel found in dist/")
    sys.exit(1)
whl = whls[0]
with zipfile.ZipFile(whl) as z:
    names = z.namelist()
    ok = any(n.endswith("scatter3d/static/scatter3d.js") for n in names)
    if not ok:
        print("ERROR: scatter3d/static/scatter3d.js not found in wheel:", whl)
        sys.exit(1)
print("OK: JS bundle found in wheel:", whl)
PY

echo "== Done. Next: twine upload (or uv publish) =="
echo "dist contents:"
ls -lh dist