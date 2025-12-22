from pathlib import Path
from itertools import cycle

import anywidget
import traitlets
import narwhals
from narwhals.typing import IntoFrameT

PACKAGE_DIR = Path(__file__).parent

DARK_GREY = "#111111"
WHITE = "#ffffff"
DEFAULT_POINT_SIZE = 0.05
TAB20_COLORS_RGB = [
    (0.12156862745098039, 0.4666666666666667, 0.7058823529411765),
    (0.6823529411764706, 0.7803921568627451, 0.9098039215686274),
    (1.0, 0.4980392156862745, 0.054901960784313725),
    (1.0, 0.7333333333333333, 0.47058823529411764),
    (0.17254901960784313, 0.6274509803921569, 0.17254901960784313),
    (0.596078431372549, 0.8745098039215686, 0.5411764705882353),
    (0.8392156862745098, 0.15294117647058825, 0.1568627450980392),
    (1.0, 0.596078431372549, 0.5882352941176471),
    (0.5803921568627451, 0.403921568627451, 0.7411764705882353),
    (0.7725490196078432, 0.6901960784313725, 0.8352941176470589),
    (0.5490196078431373, 0.33725490196078434, 0.29411764705882354),
    (0.7686274509803922, 0.611764705882353, 0.5803921568627451),
    (0.8901960784313725, 0.4666666666666667, 0.7607843137254902),
    (0.9686274509803922, 0.7137254901960784, 0.8235294117647058),
    (0.4980392156862745, 0.4980392156862745, 0.4980392156862745),
    (0.7803921568627451, 0.7803921568627451, 0.7803921568627451),
    (0.7372549019607844, 0.7411764705882353, 0.13333333333333333),
    (0.8588235294117647, 0.8588235294117647, 0.5529411764705883),
    (0.09019607843137255, 0.7450980392156863, 0.8117647058823529),
    (0.6196078431372549, 0.8549019607843137, 0.8980392156862745),
]


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = PACKAGE_DIR / "scatter3d.js"
    _css = PACKAGE_DIR / "scatter3d.css"

    # flat list [x0,y0,z0,x1,y1,z1,...]
    points_t = traitlets.List(trait=traitlets.Float()).tag(sync=True)

    # { column_name: [value_0, value_1, ...] } (all as strings)
    categories_t = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.List(trait=traitlets.Unicode()),
    ).tag(sync=True)

    # {
    #   column_name: {
    #       category_str: [r, g, b],
    #       ...
    #   },
    #   ...
    # }
    categories_colors_t = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Dict(
            key_trait=traitlets.Unicode(),
            value_trait=traitlets.List(trait=traitlets.Float(), minlen=3, maxlen=3),
        ),
    ).tag(sync=True)

    point_size = traitlets.Float(DEFAULT_POINT_SIZE).tag(sync=True)
    background = traitlets.Unicode(WHITE).tag(sync=True)

    def __init__(
        self,
        dframe: IntoFrameT,
        categories_cols: list[str],
        x_col: str = "x",
        y_col: str = "y",
        z_col: str = "z",
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._dframe = narwhals.from_native(dframe)

        # --- validate and set axis columns ---
        columns = self._dframe.columns
        for axis_name, col in (("x", x_col), ("y", y_col), ("z", z_col)):
            if col not in columns:
                raise ValueError(
                    f"{axis_name}_col {col!r} not found in data frame columns: {columns}"
                )

        self._x_col_idx = columns.index(x_col)
        self._y_col_idx = columns.index(y_col)
        self._z_col_idx = columns.index(z_col)
        self._x_col = x_col
        self._y_col = y_col
        self._z_col = z_col

        self._categories_cols: list[str] = []
        self._set_categories_cols(categories_cols)

        self._compute_points()
        self._compute_categories_and_colors()

    def _compute_points(self) -> None:
        xyz_cols = (self._x_col_idx, self._y_col_idx, self._z_col_idx)
        array = self._dframe[:, xyz_cols].to_numpy().astype("float32", copy=False)
        self.points_t = array.ravel().tolist()

    def _compute_categories_and_colors(self) -> None:
        cats_dict: dict[str, list[str]] = {}
        colors_dict: dict[str, dict[str, list[float]]] = {}

        for col in self._categories_cols:
            series = self._dframe.get_column(col)
            # ensure a real list of strings
            values = [str(v) for v in series.to_list()]
            cats_dict[col] = values

            # unique values
            different = sorted(set(values))
            color_cycle = cycle(TAB20_COLORS_RGB)
            col_colors: dict[str, list[float]] = {}
            for cat in different:
                col_colors[cat] = list(next(color_cycle))
            colors_dict[col] = col_colors

        self.categories_t = cats_dict
        self.categories_colors_t = colors_dict

    def _get_categories_cols(self) -> list[str]:
        return self._categories_cols

    def _set_categories_cols(self, cols: list[str]) -> None:
        columns = self._dframe.columns
        for col in cols:
            if col not in columns:
                raise ValueError(
                    f"Category column {col!r} not found in data frame columns: {columns}"
                )
        self._categories_cols = list(cols)

    categories_cols = property(_get_categories_cols)

    @property
    def categories(self):
        return self.categories_t

    def _get_x_col(self) -> str:
        return self._x_col

    def _set_x_col(self, col: str) -> None:
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"x_col {col!r} not found in data frame columns: {columns}"
            )
        self._x_col_idx = columns.index(col)
        self._x_col = col
        self._compute_points()

    x_col = property(_get_x_col, _set_x_col)

    def _get_y_col(self) -> str:
        return self._y_col

    def _set_y_col(self, col: str) -> None:
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"y_col {col!r} not found in data frame columns: {columns}"
            )
        self._y_col_idx = columns.index(col)
        self._y_col = col
        self._compute_points()

    y_col = property(_get_y_col, _set_y_col)

    def _get_z_col(self) -> str:
        return self._z_col

    def _set_z_col(self, col: str) -> None:
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"z_col {col!r} not found in data frame columns: {columns}"
            )
        self._z_col_idx = columns.index(col)
        self._z_col = col
        self._compute_points()

    z_col = property(_get_z_col, _set_z_col)
