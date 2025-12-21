from pathlib import Path
import anywidget
import traitlets

PACKAGE_DIR = Path(__file__).parent

DARK_GREY = "#111111"
WHITE = "#ffffff"
DEFAULT_POINT_SIZE = 0.05


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = PACKAGE_DIR / "scatter3d.js"
    _css = PACKAGE_DIR / "scatter3d.css"

    points = traitlets.List(
        trait=traitlets.List(traitlets.Float()), default_value=[]
    ).tag(sync=True)
    point_size = traitlets.Float(DEFAULT_POINT_SIZE).tag(sync=True)
    point_colors = traitlets.List(trait=traitlets.List(traitlets.Float())).tag(
        sync=True
    )
    background = traitlets.Unicode(WHITE).tag(sync=True)

    def set_points(self, xs, ys, zs):
        self.points = [[float(x), float(y), float(z)] for x, y, z in zip(xs, ys, zs)]
