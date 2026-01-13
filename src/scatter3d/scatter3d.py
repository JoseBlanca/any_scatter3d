import os
from pathlib import Path
from itertools import cycle, count
from enum import Enum
from collections import OrderedDict
from typing import Any, Callable, Sequence
import weakref
import base64

import anywidget
import traitlets
import numpy
import pandas
import narwhals


PACKAGE_DIR = Path(__file__).parent
JAVASCRIPT_DIR = PACKAGE_DIR / "static"
PROD_ESM = JAVASCRIPT_DIR / "scatter3d.js"
DEF_DEV_ESM = "http://127.0.0.1:5173/src/index.ts"

FLOAT_TYPE = "<f4"
FLOAT_TYPE_TS = "float32"
CATEGORY_CODES_DTYPE = "<u4"  # uint32 little-endian
MISSING_COLOR = (0.6, 0.6, 0.6)
MISSING_CATEGORY_VALUE = "Unassigned"

DARK_GREY = "#111111"
WHITE = "#ffffff"
DEFAULT_POINT_SIZE = 0.15
DEFAULT_AXIS_LABEL_SIZE = 0.2
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


class LabelListErrorResponse(Enum):
    ERROR = "error"
    SET_MISSING = "missing"


def _is_valid_color(color):
    if not isinstance(color, tuple):
        raise ValueError(f"Invalid color, should be tuples with three floats {color}")
    if len(color) != 3:
        raise ValueError(f"Invalid color, should be tuples with three floats {color}")
    for value in color:
        if value < 0 or value > 1:
            raise ValueError(
                f"Invalid color, should be coded as floats from 0 to 1 {color}"
            )


CategoryCallback = Callable[["Category", str], None]


class Category:
    def __init__(
        self,
        values: narwhals.typing.IntoSeriesT,
        label_list=None,
        color_palette: dict[Any, tuple[float, float, float]] | None = None,
        missing_color: tuple[float, float, float] = MISSING_COLOR,
    ):
        self._cb_id_gen = count(1)
        self._callbacks: dict[int, weakref.ReferenceType] = {}

        self._native_values_dtype = values.dtype
        values = narwhals.from_native(values, series_only=True)
        self._narwhals_values_dtype = values.dtype
        self._name = values.name
        self._values_implementation = values.implementation

        label_list = self._initialize_label_list(values, label_list)

        self._label_coding = None
        self._label_coding = self._create_label_coding(label_list)

        self._encode_values(values)

        self.create_color_palette(color_palette)

        _is_valid_color(missing_color)
        self._missing_color = missing_color

    def subscribe(self, cb: CategoryCallback) -> int:
        cb_id = next(self._cb_id_gen)
        try:
            ref = weakref.WeakMethod(cb)  # bound method
        except TypeError:
            ref = weakref.ref(cb)  # function
        self._callbacks[cb_id] = ref
        return cb_id

    def unsubscribe(self, cb_id: int) -> None:
        self._callbacks.pop(cb_id, None)

    def _notify(self, event: str) -> None:
        dead = []
        for cb_id, ref in self._callbacks.items():
            cb = ref()
            if cb is None:
                dead.append(cb_id)
            else:
                cb(self, event)
        for cb_id in dead:
            self._callbacks.pop(cb_id, None)

    @staticmethod
    def _get_unique_labels_in_values(values):
        return values.drop_nulls().unique().to_list()

    def _initialize_label_list(self, values, label_list):
        unique_labels = self._get_unique_labels_in_values(values)
        if label_list is not None:
            missing = set(unique_labels).difference(label_list)
            if missing:
                raise RuntimeError(
                    "To initialize the label list we need a label list to include all "
                    f"unique values, these are missing: {missing}"
                )
            # Keep user-provided order as-is (do not sort).
            return list(label_list)
        else:
            return sorted(unique_labels)

    @staticmethod
    def _create_label_coding(label_list):
        label_coding = OrderedDict(
            [(label, idx) for idx, label in enumerate(label_list, start=1)]
        )
        return label_coding

    def _encode_values(self, values):
        coded_values = values.replace_strict(
            self._label_coding, default=0, return_dtype=narwhals.UInt16
        ).to_numpy()
        self._coded_values = coded_values

    @property
    def values(self):
        coded_values = self._coded_values
        label_coding = self._label_coding
        if label_coding is None:
            raise RuntimeError("label coding should be set, but it is not")
        reverse_coding = {code: label for label, code in label_coding.items()}

        if self._values_implementation == narwhals.Implementation.PANDAS:
            if pandas.api.types.is_extension_array_dtype(self._native_values_dtype):
                reverse_coding[0] = pandas.NA
            else:
                reverse_coding[0] = None

            coded_values = pandas.Series(coded_values, name=self.name)
            values = coded_values.replace(reverse_coding).astype(
                self._native_values_dtype
            )
            return values
        else:
            coded_values = narwhals.new_series(
                name=self.name, values=coded_values, backend=self._values_implementation
            )
            reverse_coding[0] = None
            values = coded_values.replace_strict(
                reverse_coding, return_dtype=self._narwhals_values_dtype
            )
            return values.to_native()

    @property
    def name(self) -> str:
        return self._name

    @property
    def label_list(self) -> list:
        label_coding = self._label_coding
        if label_coding is None:
            raise RuntimeError("label coding should be set, but it is not")

        return list(label_coding.keys())

    @staticmethod
    def _get_next_unused_color(used_colors, color_cycle):
        n_colors = len(TAB20_COLORS_RGB)
        n_tried = 0
        while True:
            color = tuple(next(color_cycle))
            n_tried += 1
            if color not in used_colors:
                return color
            if n_tried >= n_colors:
                # TAB20 exhausted: allow repeats
                return color

    def set_label_list(
        self,
        new_labels: list[str] | list[int],
        on_missing_labels=LabelListErrorResponse.ERROR,
        color_palette: dict[Any, tuple[float, float, float]] | None = None,
    ):
        if not new_labels:
            raise ValueError("No labels given")

        if new_labels == self.label_list:
            return

        overrides = color_palette or {}

        old_label_coding = self._label_coding
        if old_label_coding is None:
            raise RuntimeError(
                "label coding should be set before trying to modify the label list"
            )
        labels_in_values = old_label_coding.keys()

        labels_to_remove = list(set(labels_in_values).difference(new_labels))
        if len(labels_to_remove) == len(labels_in_values):
            raise ValueError(
                "None of the new labels matches the labels found in the category"
            )
        if on_missing_labels == LabelListErrorResponse.ERROR and labels_to_remove:
            raise ValueError(
                f"Some labels are missing from the list ({labels_to_remove}), but the action set for missing is error"
            )

        new_label_coding = self._create_label_coding(new_labels)

        # --- recode values to new codes ---
        old_values = self._coded_values
        new_values = numpy.full_like(self._coded_values, fill_value=0)
        for label, new_code in new_label_coding.items():
            if label in old_label_coding:
                old_code = old_label_coding[label]
                new_values[old_values == old_code] = new_code
        self._coded_values = new_values
        self._label_coding = new_label_coding

        # --- update palette ---
        old_palette = getattr(self, "_color_palette", {}) or {}
        new_palette: dict[Any, tuple[float, float, float]] = {}

        # pass 1: overrides > old palette
        for label in new_labels:
            if label in overrides:
                color = overrides[label]
                _is_valid_color(color)
                new_palette[label] = tuple(color)
            elif label in old_palette:
                new_palette[label] = tuple(old_palette[label])

        # pass 2: assign remaining labels from TAB20 cycle
        color_cycle = cycle(TAB20_COLORS_RGB)
        used_colors = set(new_palette.values())
        for label in new_labels:
            if label in new_palette:
                continue
            color = self._get_next_unused_color(used_colors, color_cycle)
            used_colors.add(color)
            new_palette[label] = color

        self._color_palette = new_palette

        self._notify("label_list")
        self._notify("palette")

    def set_coded_values(
        self,
        coded_values: numpy.ndarray,
        label_list: list[str] | list[int],
        skip_copying_array=False,
    ):
        if not label_list == self.label_list:
            raise ValueError(
                "The label list used to code the new values should match the current one"
            )

        label_encoding = self._create_label_coding(label_list)
        if self._label_coding != label_encoding:
            raise RuntimeError("The new label encoding wouldn't match the old one")

        old_coded_values = self.coded_values
        if old_coded_values.shape != coded_values.shape:
            raise ValueError(
                "The new coded values array has a different size than the older one"
            )
        if old_coded_values.dtype != coded_values.dtype:
            raise ValueError(
                "The dtype of the new coding values does not match the one of the old ones"
            )

        if not skip_copying_array:
            coded_values = coded_values.copy(order="K")

        self._coded_values = coded_values
        self._notify("coded_values")

    @property
    def coded_values(self):
        return self._coded_values

    @property
    def label_coding(self):
        label_coding = self._label_coding
        if label_coding is None:
            raise RuntimeError(
                "label coding should be set before trying to modify the label list"
            )
        return [(label, code) for label, code in label_coding.items()]

    def create_color_palette(
        self, color_palette: dict[Any, tuple[float, float, float]] | None = None
    ):
        default_colors = cycle(TAB20_COLORS_RGB)

        palette = {}
        for label in self.label_list:
            if color_palette:
                try:
                    color = color_palette[label]
                    _is_valid_color(color)
                except KeyError:
                    raise KeyError(
                        f"Color palette given, but color missing for label: {label}"
                    )
            else:
                color = next(default_colors)
            palette[label] = tuple(color)
        self._color_palette = palette
        self._notify("palette")

    @property
    def color_palette(self):
        return self._color_palette.copy()

    @property
    def color_palette_for_codes(self):
        palette = self.color_palette

        return {code: palette[label] for label, code in self.label_coding}

    @property
    def missing_color(self):
        return self._missing_color

    @property
    def num_values(self):
        return self.coded_values.size

    @property
    def num_unassigned(self) -> int:
        """Number of values unassigned / missing."""
        coded = self._coded_values
        return int(numpy.count_nonzero(coded == 0))


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

    # xyz coords for the points
    # Packed float32 array of shape (N, 3), row-major.
    # TS interprets as Float32Array with length 3*N.
    xyz_bytes_t = traitlets.Bytes(
        default_value=b"",
        help="Packed float32 Nx3, row-major.",
    ).tag(sync=True)

    # Packed uint16 array of length N.
    # Code 0 means "missing / unassigned".
    # Codes 1..K correspond to labels_t[0..K-1].
    coded_values_t = traitlets.Bytes(
        default_value=b"",
        help="Packed uint16 length N. 0=missing, 1..K correspond to labels_t.",
    ).tag(sync=True)

    # List[str] of length K, stable ordering.
    # labels_t[i] corresponds to code (i+1).
    labels_t = traitlets.List(
        traitlets.Unicode(),
        default_value=[],
        help="Label list (length K), where code = index+1.",
    ).tag(sync=True)

    # List[[r,g,b]] of length K, aligned with labels_t.
    # Each component is float in [0,1].
    colors_t = traitlets.List(
        traitlets.List(traitlets.Float(), minlen=3, maxlen=3),
        default_value=[],
        help="Per-label RGB colors (length K) aligned with labels_t; floats in [0,1].",
    ).tag(sync=True)

    # [r,g,b] used when coded value is 0 or otherwise missing
    missing_color_t = traitlets.List(
        traitlets.Float(),
        default_value=[0.6, 0.6, 0.6],
        minlen=3,
        maxlen=3,
        help="RGB color for missing/unassigned (code 0).",
    ).tag(sync=True)

    # --- lasso round-trip channels ---
    # Dict message TS -> Python describing a committed lasso operation.
    lasso_request_t = traitlets.Dict(default_value={}).tag(sync=True)
    # Packed uint8 bitmask (binary).
    lasso_mask_t = traitlets.Bytes(default_value=b"").tag(sync=True)
    # Dict message Python -> TS acknowledging the last request (ok/error).
    lasso_result_t = traitlets.Dict(default_value={}).tag(sync=True)

    point_size_t = traitlets.Float(
        default_value=DEFAULT_POINT_SIZE,
        help="Point size for rendering (three.js PointsMaterial.size).",
    ).tag(sync=True)

    axis_label_size_t = traitlets.Float(
        default_value=DEFAULT_AXIS_LABEL_SIZE,
    ).tag(sync=True)

    show_axes_t = traitlets.Bool(
        default_value=True,
        help=("Whether to draw axis lines (X, Y, Z) from the origin (0,0,0)."),
    ).tag(sync=True)

    tooltip_request_t = traitlets.Dict(default_value={}).tag(sync=True)
    tooltip_response_t = traitlets.Dict(default_value={}).tag(sync=True)

    client_ready_t = traitlets.Bool(
        default_value=False,
        help="Set True by the frontend once JS is initialized and can talk to Python.",
    ).tag(sync=True)

    interactive_ready_t = traitlets.Bool(
        default_value=False,
        help="True once frontend has announced readiness; used to gate UI features.",
    ).tag(sync=True)

    interaction_mode_t = traitlets.Unicode(
        default_value="rotate",
        help="Interaction mode: 'rotate' or 'lasso'.",
    ).tag(sync=True)

    # Active category label (string). In lasso mode it must always be non-empty and valid.
    active_category_t = traitlets.Unicode(
        default_value=None,
        allow_none=True,
        help="Active category label (str) or None. In lasso mode it must be a valid label from labels_t.",
    ).tag(sync=True)

    # Legend placement (split into two validated strings; easier to validate than a Dict schema)
    legend_side_t = traitlets.Unicode(
        default_value="right",
        help="Legend side: 'left' or 'right'.",
    ).tag(sync=True)

    legend_dock_t = traitlets.Unicode(
        default_value="top",
        help="Legend dock: 'top' or 'bottom'.",
    ).tag(sync=True)

    def __init__(
        self,
        xyz: numpy.ndarray,
        category: Category,
        point_ids: Sequence[str]
        | Sequence[int]
        | narwhals.typing.IntoSeriesT
        | None = None,
    ):
        super().__init__()
        self._category_cb_id: int | None = None

        if category is not None and xyz.shape[0] != category.num_values:
            raise ValueError(
                f"The number of points ({xyz.shape[0]}) should match "
                f"the number of values in the category: {category.num_values}"
            )

        if point_ids is not None and xyz.shape[0] != len(point_ids):
            raise ValueError(
                f"The number of points ({xyz.shape[0]}) should match "
                f"the number of values in the category: {category.num_values}"
            )

        # Keep a stable callback object so unsubscribe works.
        self._category_cb = self._on_category_changed

        self._xyz = None
        self._category = None
        self.xyz = xyz

        self._set_default_sizes()

        self.category = category

        self.point_ids = self._normalize_point_ids(point_ids)

        # clear tooltip state
        self.tooltip_response_t = {}

        # Enforce initial invariants (rotate default allows empty active category)
        self._ensure_active_category_invariants()

    @traitlets.validate("interaction_mode_t")
    def _validate_interaction_mode_t(self, proposal):
        v = proposal["value"]
        if v not in ("rotate", "lasso"):
            raise traitlets.TraitError("interaction_mode_t must be 'rotate' or 'lasso'")
        return v

    @traitlets.validate("legend_side_t")
    def _validate_legend_side_t(self, proposal):
        v = proposal["value"]
        if v not in ("left", "right"):
            raise traitlets.TraitError("legend_side_t must be 'left' or 'right'")
        return v

    @traitlets.validate("legend_dock_t")
    def _validate_legend_dock_t(self, proposal):
        v = proposal["value"]
        if v not in ("top", "bottom"):
            raise traitlets.TraitError("legend_dock_t must be 'top' or 'bottom'")
        return v

    def _ensure_active_category_invariants(self) -> None:
        """
        Enforce invariants for interaction_mode_t and active_category_t.
        - In lasso mode, active_category_t must be a valid label and non-empty.
          If empty/invalid, set deterministically to first label in labels_t.
        - In rotate mode, empty active_category_t is allowed.
          If non-empty but invalid, raise (no silent fallback).
        """
        mode = self.interaction_mode_t
        labels = list(self.labels_t or [])

        if mode == "lasso":
            if not labels:
                # Professional behavior: lasso mode without categories is a hard error.
                raise RuntimeError("Cannot enter lasso mode: labels_t is empty")

            if self.active_category_t is not None and self.active_category_t in labels:
                return

            # Required deterministic behavior: choose the first category label.
            self.active_category_t = labels[0]
            if self.interactive_ready_t:
                self.send_state("active_category_t")
            return

        # rotate mode
        if self.active_category_t is None:
            return
        if self.active_category_t not in labels:
            raise RuntimeError(
                f"active_category_t={self.active_category_t!r} is not present in labels_t"
            )

    @traitlets.observe("interaction_mode_t")
    def _on_interaction_mode_t(self, change) -> None:
        if change.get("new") == "lasso":
            self._ensure_active_category_invariants()

    @traitlets.observe("active_category_t")
    def _on_active_category_t(self, change) -> None:
        if self.interaction_mode_t == "lasso" and change.get("new") is None:
            # NOTE: traitlets bypasses @validate(...) when allow_none=True.
            # In lasso mode, clearing is a hard error (no silent fallback).
            old = change.get("old")
            if old is not None:
                # restore previous valid value to keep state consistent
                self.set_trait("active_category_t", old)
            raise traitlets.TraitError("active_category_t cannot be None in lasso mode")

    @traitlets.observe("labels_t")
    def _on_labels_t(self, change) -> None:
        if self.interaction_mode_t == "lasso":
            self._ensure_active_category_invariants()
        elif self.active_category_t is not None and self.active_category_t not in (
            change.get("new") or []
        ):
            # in rotate mode, invalid active is a real error
            raise RuntimeError(...)

    @traitlets.observe("client_ready_t")
    def _on_client_ready_t(self, change) -> None:
        # Only ever transition False -> True
        if bool(change.get("new")) is True and self.interactive_ready_t is not True:
            self.interactive_ready_t = True
            self.send_state("interactive_ready_t")

    def _set_default_sizes(self):
        # If there are no points, keep deterministic defaults.
        # This must never crash widget construction.
        if self.num_points == 0:
            self.point_size_t = float(DEFAULT_POINT_SIZE)
            self.axis_label_size_t = float(DEFAULT_AXIS_LABEL_SIZE)
            return

        max_abs = float(numpy.abs(self.xyz).max())
        self.point_size_t = max_abs / 20.0
        self.axis_label_size_t = max_abs / 5.0

    def _normalize_point_ids(self, point_ids):
        num_points = self.num_points

        if point_ids is None:
            point_ids = tuple(range(1, num_points + 1))

        elif isinstance(point_ids, narwhals.Series):
            point_ids = tuple(point_ids.to_list())

        elif isinstance(point_ids, Sequence) and not isinstance(
            point_ids, (str, bytes)
        ):
            point_ids = tuple(point_ids)
        else:
            raise TypeError("point_ids must be a Series, a sequence of values, or None")

        if len(point_ids) != num_points:
            raise ValueError("point_ids length must match number of points")

        return point_ids

    def _category_label_for_index(self, idx: int) -> str | None:
        if self._category is None:
            return None
        coded = self._category.coded_values
        code = int(coded[idx])
        if code <= 0:
            return None
        # label_list is 0-based, codes are 1..K
        return str(self._category.label_list[code - 1])

    @traitlets.validate("active_category_t")
    def _validate_active_category_t(self, proposal):
        v = proposal["value"]

        if v is None:
            # allowed only in rotate mode
            mode = getattr(self, "interaction_mode_t", "rotate")
            if mode == "lasso":
                raise traitlets.TraitError(
                    "active_category_t cannot be None in lasso mode"
                )
            return None

        if not isinstance(v, str):
            raise traitlets.TraitError("active_category_t must be a string or None")

        if v == "":
            # reject empty string entirely; it was legacy sentinel
            mode = getattr(self, "interaction_mode_t", "rotate")
            raise traitlets.TraitError(
                "active_category_t must be None (rotate) or a valid label string (rotate/lasso); empty string is not allowed"
            )

        labels = list(self.labels_t or [])
        mode = getattr(self, "interaction_mode_t", "rotate")

        if mode == "lasso":
            if not labels:
                raise traitlets.TraitError(
                    "Cannot set active_category_t: labels_t is empty"
                )
            if v not in labels:
                raise traitlets.TraitError(
                    f"active_category_t={v!r} is not present in labels_t"
                )
            return v

        # rotate mode
        if labels and v not in labels:
            raise traitlets.TraitError(
                f"active_category_t={v!r} is not present in labels_t"
            )
        return v

    @traitlets.observe("tooltip_request_t")
    def _on_tooltip_request(self, change) -> None:
        req = change["new"] or {}
        if not isinstance(req, dict):
            return
        if req.get("kind") != "tooltip":
            return

        request_id = int(req.get("request_id", 0) or 0)
        i = req.get("i", None)

        try:
            i = int(i)
            if i < 0 or i >= self.num_points:
                raise IndexError(f"point index out of range: {i}")

            data = {
                "idx": i,
                "id": str(self.point_ids[i]),
                "category": self._category_label_for_index(i),
            }

            self.tooltip_response_t = {
                "request_id": request_id,
                "status": "ok",
                "data": data,
            }
        except Exception as e:
            self.tooltip_response_t = {
                "request_id": request_id,
                "status": "error",
                "message": str(e),
            }

        # Force comm sync (important for anywidget)
        self.send_state("tooltip_response_t")

    def _on_category_changed(self, category: Category, event: str) -> None:
        """
        Called when Category mutates.
        """
        # Sanity: ignore stale callbacks (if category replaced)
        if category is not self._category:
            return
        self._sync_traitlets_from_category()

    @staticmethod
    def _pack_xyz_float32_c(xyz: numpy.ndarray) -> tuple[numpy.ndarray, bytes]:
        """
        Return (xyz_float32_c, packed_bytes).
        - xyz_float32_c: float32, C-contiguous, shape (N,3)
        - packed_bytes: xyz_float32_c.tobytes(order="C")
        """
        if not isinstance(xyz, numpy.ndarray):
            raise ValueError("xyz should be a numpy array")

        if xyz.ndim != 2 or xyz.shape[1] != 3:
            raise ValueError("xyz should have shape (N, 3)")

        # Convert dtype to float32 (TS expects Float32Array)
        # Ensure row-major contiguous layout for stable tobytes.
        xyz_f32 = numpy.asarray(xyz, dtype=numpy.float32, order="C")
        if not xyz_f32.flags["C_CONTIGUOUS"]:
            xyz_f32 = numpy.ascontiguousarray(xyz_f32)

        # Remap (x,y,z) -> (x,z,y) so that "z" in user data becomes "up" (Y) in Three.js
        # avoid mutating caller's array if it was already float32 C
        # xyz_f32 = xyz_f32.copy()
        xyz_f32[:, [1, 2]] = xyz_f32[:, [2, 1]]

        return xyz_f32, xyz_f32.tobytes(order="C")

    def _get_xyz(self) -> numpy.ndarray:
        if self._xyz is None:
            raise RuntimeError("xyz has not been set")
        out = self._xyz.copy()
        out[:, [1, 2]] = out[:, [2, 1]]
        return out

    def _set_xyz(self, xyz: numpy.ndarray) -> None:
        xyz_f32, xyz_bytes = self._pack_xyz_float32_c(xyz)

        # If category already set, enforce N consistency
        if self._category is not None and xyz_f32.shape[0] != self.category.num_values:
            raise ValueError(
                f"The number of points ({xyz_f32.shape[0]}) should match "
                f"the number of values in the category: {self.category.num_values}"
            )

        self._xyz = xyz_f32
        self.xyz_bytes_t = xyz_bytes

    xyz = property(_get_xyz, _set_xyz)

    @staticmethod
    def _pack_u16_c(arr: numpy.ndarray) -> bytes:
        arr_u16 = numpy.asarray(arr, dtype=numpy.uint16, order="C")
        if not arr_u16.flags["C_CONTIGUOUS"]:
            arr_u16 = numpy.ascontiguousarray(arr_u16)
        return arr_u16.tobytes(order="C")

    def _sync_traitlets_from_category(self) -> None:
        """
        Push the Category state into synced transport traitlets.
        Assumes self._xyz and self._category are both set and consistent in length.
        """
        if self._category is None:
            raise RuntimeError("The category should be set")

        cat = self._category

        # labels_t must be JSON-friendly; enforce str
        labels = [str(lbl) for lbl in cat.label_list]
        self.labels_t = labels

        # coded values: uint16 bytes, length N
        coded = cat.coded_values
        if coded.shape[0] != self.num_points:
            raise RuntimeError(
                f"Category has {coded.shape[0]} values but xyz has {self.num_points} points"
            )
        self.coded_values_t = self._pack_u16_c(coded)

        # colors aligned with labels order
        # Category stores palette keyed by original labels; we reconstruct in label_list order.
        palette = cat.color_palette  # label -> (r,g,b)
        self.colors_t = [list(map(float, palette[lbl])) for lbl in cat.label_list]

        # missing color
        self.missing_color_t = list(map(float, cat.missing_color))

        if len(self.colors_t) != len(self.labels_t):
            raise RuntimeError(
                "Internal error: colors_t length must match labels_t length"
            )

        self._ensure_active_category_invariants()

    def _get_category(self):
        return self._category

    def _set_category(self, category: Category) -> None:
        if self._xyz is not None and category.num_values != self.num_points:
            raise ValueError(
                f"The number of values in the category ({category.num_values}) "
                f"should match the number of points {self.num_points}"
            )
        if self._category is not None and self._category_cb_id is not None:
            self._category.unsubscribe(self._category_cb_id)

        self._category = category
        # Subscribe to new category
        self._category_cb_id = category.subscribe(self._on_category_changed)
        self._sync_traitlets_from_category()

    category = property(_get_category, _set_category)

    @property
    def num_points(self):
        return self.xyz.shape[0]

    def close(self):
        # detach callback to avoid keeping references around.
        if self._category is not None and self._category_cb_id is not None:
            self._category.unsubscribe(self._category_cb_id)
            self._category_cb_id = None
        super().close()

    def _label_to_code_map(self) -> dict[str, int]:
        # labels_t[i] -> code i+1
        return {lbl: i + 1 for i, lbl in enumerate(self.labels_t)}

    def _unpack_mask(self, mask_payload) -> numpy.ndarray:
        n = self.num_points
        needed = (n + 7) // 8

        if isinstance(mask_payload, (bytes, bytearray, memoryview)):
            mask_bytes = bytes(mask_payload)
        else:
            raise ValueError(
                f"lasso_mask_t must be bytes-like, got {type(mask_payload)}"
            )

        if len(mask_bytes) < needed:
            raise ValueError(
                f"lasso_mask_t too short: got {len(mask_bytes)} bytes, need {needed} for N={n}"
            )

        b = numpy.frombuffer(mask_bytes, dtype=numpy.uint8, count=needed)
        bits = numpy.unpackbits(b, bitorder="big")
        return bits[:n].astype(bool, copy=False)

    def _apply_lasso_mask_edit(self, op: str, code: int, mask: numpy.ndarray) -> int:
        """
        Apply add/remove using a boolean mask of length N.
        Returns number of points actually changed.
        """
        if self._category is None:
            raise RuntimeError("No category set")

        if mask.dtype != numpy.bool_ or mask.shape != (self.num_points,):
            raise ValueError("Internal error: mask must be bool with shape (N,)")

        if code < 0 or code > 65535:
            raise ValueError(f"Invalid code {code} (must fit uint16)")
        if code == 0 and op == "add":
            raise ValueError("Cannot add code 0 (reserved for missing/unassigned)")

        old = self._category.coded_values
        new = old.copy()

        if op == "add":
            changed = int(numpy.sum(new[mask] != numpy.uint16(code)))
            new[mask] = numpy.uint16(code)
        elif op == "remove":
            # Only remove points currently in that label
            to_zero = mask & (new == numpy.uint16(code))
            changed = int(numpy.sum(to_zero))
            new[to_zero] = numpy.uint16(0)
        else:
            raise ValueError(f"Unknown op: {op!r}")

        # Update Category (will notify; widget callback syncs coded_values_t etc.)
        self._category.set_coded_values(
            coded_values=new,
            label_list=self._category.label_list,
            skip_copying_array=True,
        )
        return changed

    @traitlets.observe("lasso_request_t")
    def _on_lasso_request_t(self, change) -> None:
        req = change.get("new", {})
        if not req:
            return

        request_id = req.get("request_id")
        res: dict[str, object] = {"request_id": request_id}

        try:
            if req.get("kind") != "lasso_commit":
                raise ValueError(f"Unsupported kind: {req.get('kind')!r}")

            op = req.get("op")
            if op not in ("add", "remove"):
                raise ValueError(f"Invalid op: {op!r}")

            # resolve code from either explicit code or label
            if "code" in req and req["code"] is not None:
                code = int(req["code"])
            else:
                label = req.get("label")
                if label is None:
                    raise ValueError("Missing field: label (or code)")
                label_s = str(label)
                m = self._label_to_code_map()
                if label_s not in m:
                    raise ValueError(f"Unknown label: {label_s!r}")
                code = m[label_s]

            # unpack mask from bytes traitlet
            if not isinstance(self.lasso_mask_t, (bytes, bytearray, memoryview)):
                raise RuntimeError(
                    f"Internal error: lasso_mask_t must be bytes, got {type(self.lasso_mask_t)}"
                )
            mask = self._unpack_mask(self.lasso_mask_t)
            num_selected = int(numpy.sum(mask))

            changed = self._apply_lasso_mask_edit(op=op, code=code, mask=mask)

            res.update(
                {
                    "status": "ok",
                    "num_selected": num_selected,
                    "num_changed": changed,
                }
            )
        except Exception as e:
            res.update({"status": "error", "message": str(e)})

        self.lasso_result_t = res

    def _get_point_size(self) -> float:
        return float(self.point_size_t)

    def _set_point_size(self, value: float) -> None:
        v = float(value)
        if not numpy.isfinite(v) or v <= 0:
            raise ValueError("point_size must be a finite positive number")
        self.point_size_t = v

    point_size = property(_get_point_size, _set_point_size)

    def _get_axis_label_size(self) -> float:
        return float(self.axis_label_size_t)

    def _set_axis_label_size(self, value: float) -> None:
        v = float(value)
        if not numpy.isfinite(v) or v <= 0:
            raise ValueError("axes label size must be a finite positive number")
        self.axis_label_size_t = v

    axis_label_size = property(_get_axis_label_size, _set_axis_label_size)
