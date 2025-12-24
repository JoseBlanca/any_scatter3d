from pathlib import Path

import anywidget
import traitlets

PACKAGE_DIR = Path(__file__).parent
JAVASCRIPT_DIR = PACKAGE_DIR / "static"


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = PACKAGE_DIR / "static" / "scatter3d.js"

    message = traitlets.Unicode("Hello").tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)
