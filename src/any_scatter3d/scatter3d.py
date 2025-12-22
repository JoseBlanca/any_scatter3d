from pathlib import Path
from typing import Sequence
from itertools import cycle

import anywidget
import traitlets
import narwhals
from narwhals.typing import IntoFrameT

PACKAGE_DIR = Path(__file__).parent

DARK_GREY = "#111111"
WHITE = "#ffffff"
DEFAULT_POINT_SIZE = 0.05
TAB20_COLORS = [
    "#1f77b4",
    "#aec7e8",
    "#ff7f0e",
    "#ffbb78",
    "#2ca02c",
    "#98df8a",
    "#d62728",
    "#ff9896",
    "#9467bd",
    "#c5b0d5",
    "#8c564b",
    "#c49c94",
    "#e377c2",
    "#f7b6d2",
    "#7f7f7f",
    "#c7c7c7",
    "#bcbd22",
    "#dbdb8d",
    "#17becf",
    "#9edae5",
]
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

    points = traitlets.List(traitlets.Float()).tag(
        sync=True
    )  # flat list [x0,y0,z0,x1,y1,z1,...]
    category_colors = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.List(trait=traitlets.Float(), minlen=3, maxlen=3),
    ).tag(sync=True)
    categories = traitlets.List(trait=traitlets.Unicode()).tag(sync=True)

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

        self._x_col = None
        self._y_col = None
        self._z_col = None
        self._x_col_idx = None
        self._y_col_idx = None
        self._z_col_idx = None
        self.x_col = x_col
        self.y_col = y_col
        self.z_col = z_col

        self._categories_cols = []
        self.categories_cols = categories_cols
        self._categories_col = None
        self.current_categories_col = categories_cols[0]

        self.set_points()

    def _get_categories_cols(self):
        return self._categories_cols

    def _set_categories_cols(self, categories):
        columns = self._dframe.columns
        for category in self.categories:
            if category not in columns:
                raise ValueError("Category column {category} not found in data frame")
        self._categories_cols = categories

    categories_cols = property(_get_categories_cols, _set_categories_cols)

    def _get_categories_col(self):
        return self._categories_col

    def _set_categories_col(self, col: str):
        if col not in self.categories_cols:
            raise ValueError(
                f"categories col: {col} not found in the categories columns: {self.categories_cols}"
            )
        self._categories_col = col

    current_categories_col = property(_get_categories_col, _set_categories_col)

    def _get_x_col(self):
        return self._x_col

    def _set_x_col(self, col: str):
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"x_col: {col} not found in the data frame columns: {self._dframe.columns}"
            )
        self._x_col_idx = columns.index(col)
        self._x_col = col

    x_col = property(_get_x_col, _set_x_col)

    def _get_y_col(self):
        return self._y_col

    def _set_y_col(self, col: str):
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"y_col: {col} not found in the data frame columns: {self._dframe.columns}"
            )
        self._y_col_idx = columns.index(col)
        self._y_col = col

    y_col = property(_get_y_col, _set_y_col)

    def _get_z_col(self):
        return self._z_col

    def _set_z_col(self, col: str):
        columns = self._dframe.columns
        if col not in columns:
            raise ValueError(
                f"x_col: {col} not found in the data frame columns: {self._dframe.columns}"
            )
        self._z_col_idx = columns.index(col)
        self._z_col = col

    z_col = property(_get_z_col, _set_z_col)

    def set_points(
        self,
    ):
        dframe = self._dframe

        xyz_cols = (self._x_col_idx, self._y_col_idx, self._z_col_idx)

        array = dframe[:, xyz_cols].to_numpy().astype("float32", copy=False)
        self.points = array.ravel().tolist()

        categories = dframe.get_column(self.current_categories_col)

        different_categories = sorted(set(categories))
        color_cycle = cycle(TAB20_COLORS_RGB)
        category_colors = {
            category: next(color_cycle) for category in different_categories
        }
        self.category_colors = category_colors

        categories_to_str = {}
        for category in different_categories:
            category_str = str(category)
            if category in categories_to_str:
                raise ValueError(
                    "Two categories should not map to the same string: {category}"
                )
            categories_to_str[category_str] = category

        self.categories = list(map(str, categories))
