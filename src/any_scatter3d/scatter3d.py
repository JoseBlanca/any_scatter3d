import os
from pathlib import Path

import anywidget
import traitlets

PACKAGE_DIR = Path(__file__).parent
JAVASCRIPT_DIR = PACKAGE_DIR / "static"
PROD_ESM = JAVASCRIPT_DIR / "scatter3d.js"
DEF_DEV_ESM = "http://127.0.0.1:5173/src/index.ts"


def _esm_source() -> str | Path:
    if os.environ.get("ANY_SCATTER3D_DEV", ""):
        return os.environ.get("ANY_SCATTER3D_DEV_URL", DEF_DEV_ESM)
    return PROD_ESM


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = _esm_source()

    message = traitlets.Unicode("Hello").tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)
