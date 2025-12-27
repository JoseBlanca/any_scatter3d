import os
from pathlib import Path
from itertools import cycle
from math import nan

import anywidget
import traitlets
import numpy
import pandas
import narwhals
from narwhals.typing import IntoFrameT


PACKAGE_DIR = Path(__file__).parent
JAVASCRIPT_DIR = PACKAGE_DIR / "static"
PROD_ESM = JAVASCRIPT_DIR / "scatter3d.js"
DEF_DEV_ESM = "http://127.0.0.1:5173/src/index.ts"

FLOAT_TYPE = "<f4"
FLOAT_TYPE_TS = "float32"
CATEGORY_CODES_DTYPE = "<u4"  # uint32 little-endian
UNSET_COLOR = [0.6, 0.6, 0.6]
MISSING_CATEGORY_VALUE = "Unassigned"

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


def _esm_source() -> str | Path:
    if os.environ.get("ANY_SCATTER3D_DEV", ""):
        return os.environ.get("ANY_SCATTER3D_DEV_URL", DEF_DEV_ESM)
    return PROD_ESM


def _is_missing(value: object) -> bool:
    if value is None or value is pandas.NA:
        return True
    try:
        # True for float('nan') and pandas NA scalars
        return bool(pandas.isna(value))
    except Exception:
        return False


class Scatter3dWidget(anywidget.AnyWidget):
    _esm = _esm_source()
    # packed float32 xyzxyz...
    points_t = traitlets.Bytes(default_value=b"").tag(sync=True)
    points_dtype_t = traitlets.Unicode(FLOAT_TYPE_TS).tag(sync=True)
    points_stride_t = traitlets.Int(3).tag(sync=True)

    # For a given category column `col` and point index `i`:
    #   code  = coded_categories_t[col][i]
    #   label = labels_for_categories_t[col][code]
    #   color = categories_colors_t[col][code]

    # Dict[str, Bytes]
    # For each categorical column, stores a packed array of integer category codes,
    # one code per row / point.
    #
    # - Key: category column name
    # - Value: raw bytes of a contiguous uint32 array (little-endian),
    #   length == number of points.
    #
    # Semantics:
    # - Each entry corresponds positionally to a point in `points_t`.
    # - Code 0 is reserved for the `None` category.
    # - Code 1 is reserved for the `NaN` category.
    # - Codes >= 2 represent user-defined category values.
    #
    # This representation is compact and efficient to transfer and decode in JS:
    # the frontend reconstructs a Uint32Array and uses the codes as direct indices
    # into `labels_for_categories_t` and `categories_colors_t`.
    #
    # IMPORTANT:
    # - The meaning of each code is defined by `labels_for_categories_t`.
    # - Codes are contiguous and stable within a widget lifetime, but not persistent
    #   across widget re-creation.
    coded_categories_t = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Bytes(),
    ).tag(sync=True)

    # Dict[str, List[str]]
    # For each categorical column, provides the human-readable label associated with
    # each integer category code.
    #
    # - Key: category column name
    # - Value: list of strings where index == category code
    #
    # Semantics:
    # - labels[0] == "None"   → category code 0
    # - labels[1] == "nan"    → category code 1
    # - labels[i] (i >= 2)    → string representation of the user-provided category value
    #
    # Constraints:
    # - String labels are guaranteed to be unique within a column:
    #   if two distinct Python values would collapse to the same string label,
    #   an error is raised on the Python side.
    #
    # Notes:
    # - Labels are intended for UI display and selection logic in the frontend.
    # - Exact Python types are NOT encoded here; Python-side reverse mapping is
    #   handled separately via an internal label→value dictionary.
    labels_for_categories_t = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.List(trait=traitlets.Unicode()),
    ).tag(sync=True)

    # Dict[str, List[List[float]]]
    # For each categorical column, stores the RGB color associated with each category code.
    #
    # - Key: category column name
    # - Value: list of [r, g, b] triples (floats in [0, 1]), where index == category code
    #
    # Semantics:
    # - colors[0] → color for the `None` category
    # - colors[1] → color for the `NaN` category
    # - colors[i] → color for the category whose label is labels_for_categories_t[col][i]
    #
    # Constraints:
    # - The outer list length matches `labels_for_categories_t[col]`.
    # - Each inner list has exactly three floats (RGB).
    categories_colors_t = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.List(
            trait=traitlets.List(trait=traitlets.Float(), minlen=3, maxlen=3)
        ),
    ).tag(sync=True)

    point_size_t = traitlets.Float(DEFAULT_POINT_SIZE).tag(sync=True)
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
        xyz = numpy.asarray(
            self._dframe[:, xyz_cols].to_numpy(),
            dtype=FLOAT_TYPE,
            order="C",
        )

        self.points_t = xyz.tobytes(order="C")

    def _compute_categories_and_colors(self) -> None:
        """
        Build per-category integer codes (packed as bytes) + label/color palettes.

        Encoding rule (single sentinel):
        - code 0  => missing (None / NaN / pd.NA / any pandas.isna(...) true)
        - code >=1 => concrete category values

        `labels_for_categories_t[cat]` is indexed by code (so labels[0] exists),
        and `categories_colors_t[cat]` is likewise indexed by code.
        """
        user_categories_colors = {}

        coded_categories: dict[str, bytes] = {}
        labels_for_categories: dict[str, list[str]] = {}
        categories_colors: dict[str, list[list[float]]] = {}
        label_to_value_for_category_cols: dict[str, dict[str, object]] = {}

        for category_col in self._categories_cols:
            series = self._dframe.get_column(category_col)
            values = series.to_list() if hasattr(series, "to_list") else list(series)

            user_color_map = user_categories_colors.get(category_col, {})
            color_cycle = cycle(TAB20_COLORS_RGB)

            # code 0: missing
            # Keep a placeholder label/color at index 0 so JS can do labels[code], colors[code].
            labels: list[str] = [MISSING_CATEGORY_VALUE]
            colors: list[list[float]] = [list(UNSET_COLOR)]

            # mapping only for non-missing, hashable values
            value_to_code: dict[object, int] = {}
            label_to_value: dict[str, object] = {}  # only concrete labels (no sentinel)

            codes_list: list[int] = []

            for value in values:
                if _is_missing(value):
                    codes_list.append(0)
                    continue

                # forbid floats other than NaN (already captured by _is_missing)
                if isinstance(value, float):
                    raise ValueError(
                        f"Category value in column {category_col} is a forbidden float: {value!r}. "
                        "Use strings/ints (and missing values for unset)."
                    )

                # hashability check must happen before dict membership
                try:
                    hash(value)
                except TypeError:
                    raise ValueError(
                        f"Unhashable category value in {category_col}: {value!r} (type {type(value)}). "
                        "Use strings/ints (and missing values for unset)."
                    )

                if value in value_to_code:
                    code = value_to_code[value]
                else:
                    label = str(value)

                    # Ensure stringification doesn't collapse distinct values
                    if label in label_to_value:
                        prev = label_to_value[label]
                        raise ValueError(
                            f"In {category_col}, two distinct values collapse to the same label {label!r}: "
                            f"{prev!r} (type {type(prev)}) vs {value!r} (type {type(value)})."
                        )
                    label_to_value[label] = value

                    # Next code: labels currently includes sentinel at index 0,
                    # so first real label gets code 1, etc.
                    code = len(labels)
                    value_to_code[value] = code
                    labels.append(label)
                    colors.append(list(user_color_map.get(value, next(color_cycle))))

                codes_list.append(code)

            codes = numpy.asarray(codes_list, dtype=CATEGORY_CODES_DTYPE, order="C")
            coded_categories[category_col] = codes.tobytes(order="C")
            labels_for_categories[category_col] = labels
            categories_colors[category_col] = colors
            label_to_value_for_category_cols[category_col] = label_to_value

        self.coded_categories_t = coded_categories
        self.labels_for_categories_t = labels_for_categories
        self.categories_colors_t = categories_colors
        self.label_to_value_for_category_cols = label_to_value_for_category_cols

    @property
    def categories_cols(self) -> list[str]:
        return self._categories_cols

    def _set_categories_cols(self, cols: list[str]) -> None:
        columns = self._dframe.columns
        for col in cols:
            if col not in columns:
                raise ValueError(
                    f"Category column {col!r} not found in data frame columns: {columns}"
                )
        self._categories_cols = list(cols)

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

    def _num_points(self) -> int:
        pts = getattr(self, "points", None) or []
        return len(pts)

    def get_classifications(
        self,
        classification_categories: list[str],
    ) -> pandas.DataFrame:
        """
        Return the current classifications as a pandas DataFrame.

        - One column per requested category.
        - Column dtype is pandas.StringDtype() (nullable string).
        - Missing/unassigned points are returned as pd.NA (code 0).
        """
        if not classification_categories:
            return pandas.DataFrame()

        coded: dict[str, bytes] = dict(self.coded_categories_t or {})
        labels_map: dict[str, list[str]] = dict(self.labels_for_categories_t or {})

        # Require categories exist
        for cat in classification_categories:
            if cat not in coded:
                raise KeyError(
                    f"A requested category was not given in the input dataframe: {cat}"
                )
            if cat not in labels_map:
                raise RuntimeError(
                    f"Internal error: labels_for_categories_t missing entry for category: {cat}"
                )

        first_cat = classification_categories[0]
        first_buf = coded[first_cat]

        # 0 points: return empty frame WITH requested columns, dtype=string
        if len(first_buf) == 0:
            return pandas.DataFrame(
                {
                    cat: pandas.Series(pandas.array([], dtype="string"))
                    for cat in classification_categories
                }
            )

        if len(first_buf) % 4 != 0:
            raise RuntimeError(
                f"Category '{first_cat}' codes buffer length {len(first_buf)} is not divisible by 4 "
                "(expected <u4 packing)."
            )

        expected_nbytes = len(first_buf)
        n = expected_nbytes // 4

        # Sanity: all requested categories must match byte length exactly
        bad: dict[str, int] = {}
        for cat in classification_categories:
            buf = coded[cat]
            if len(buf) != expected_nbytes:
                bad[cat] = len(buf)
        if bad:
            bad[first_cat] = expected_nbytes
            raise ValueError(f"coded_categories_t byte lengths differ: {bad}")

        out: dict[str, pandas.Series] = {}

        for cat in classification_categories:
            buf = coded[cat]

            # Strict decode (no count=...): if bytes mismatch, we already raised above.
            codes = numpy.frombuffer(buf, dtype="<u4")
            if codes.size != n:  # defensive; should not happen if len(buf) == n*4
                raise RuntimeError(
                    f"Internal error: decoded codes length ({codes.size}) does not match expected {n}."
                )

            labels = labels_map[cat]
            if not labels:
                raise RuntimeError(
                    f"Internal error: empty labels list for category: {cat}"
                )

            cb = numpy.asarray(labels, dtype=object)

            arr = numpy.full(n, pandas.NA, dtype=object)
            valid = (codes >= 1) & (codes < cb.size)
            if numpy.any(valid):
                arr[valid] = cb[codes[valid]]

            out[cat] = pandas.Series(pandas.array(arr, dtype="string"))

        return pandas.DataFrame(out)
