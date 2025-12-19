from pathlib import Path
import anywidget
import traitlets

PACKAGE_DIR = Path(__file__).parent


class CounterWidget(anywidget.AnyWidget):
    _esm = PACKAGE_DIR / "counter.js"
    _css = PACKAGE_DIR / "counter.css"
    count = traitlets.Int(0).tag(sync=True)


CounterWidget(count=42)
