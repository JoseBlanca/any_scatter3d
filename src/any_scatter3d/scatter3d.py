from pathlib import Path

import anywidget
import traitlets
import narwhals
from narwhals.typing import IntoFrameT

PACKAGE_DIR = Path(__file__).parent

DARK_GREY = "#111111"
WHITE = "#ffffff"
DEFAULT_POINT_SIZE = 0.05


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = PACKAGE_DIR / "scatter3d.js"
    _css = PACKAGE_DIR / "scatter3d.css"

    points = traitlets.List(traitlets.Float()).tag(
        sync=True
    )  # flat list [x0,y0,z0,x1,y1,z1,...]
    point_size = traitlets.Float(DEFAULT_POINT_SIZE).tag(sync=True)
    point_colors = traitlets.List(trait=traitlets.List(traitlets.Float())).tag(
        sync=True
    )
    background = traitlets.Unicode(WHITE).tag(sync=True)

    def set_points(
        self,
        dframe: IntoFrameT,
        x_col_idx: int = 0,
        y_col_idx: int = 1,
        z_col_idx: int = 2,
    ):
        dframe = narwhals.from_native(dframe)
        array = (
            dframe[:, (x_col_idx, y_col_idx, z_col_idx)]
            .to_numpy()
            .astype("float32", copy=False)
        )
        self.points = array.ravel().tolist()
