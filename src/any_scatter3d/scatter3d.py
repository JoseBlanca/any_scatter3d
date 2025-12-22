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
    point_size = traitlets.Float(DEFAULT_POINT_SIZE).tag(sync=True)
    background = traitlets.Unicode(WHITE).tag(sync=True)
    category_colors = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.List(trait=traitlets.Float(), minlen=3, maxlen=3),
    ).tag(sync=True)
    categories = traitlets.List(trait=traitlets.Unicode()).tag(sync=True)

    def set_points(
        self,
        dframe: IntoFrameT,
        x_col: str = "x",
        y_col: str = "y",
        z_col: str = "z",
        categories_col: Sequence[str | int] = "category",
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

        categories = dframe.get_column(categories_col)

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
