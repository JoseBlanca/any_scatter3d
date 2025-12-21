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
        x_col: str = "x",
        y_col: str = "y",
        z_col: str = "z",
    ):
        dframe = narwhals.from_native(dframe)

        columns = dframe.columns

        try:
            xyz_cols = [columns.index(col) for col in (x_col, y_col, z_col)]
        except ValueError:
            raise ValueError(
                "Some column not found in data frame: {x_col}, {y_col}, {z_col}"
            )

        array = dframe[:, xyz_cols].to_numpy().astype("float32", copy=False)
        self.points = array.ravel().tolist()
