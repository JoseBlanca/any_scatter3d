import os
from pathlib import Path
from itertools import cycle, count
from enum import Enum
from collections import OrderedDict
from typing import Any, Callable
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
            labels_not_in_label_list = set(label_list).difference(unique_labels)
            if labels_not_in_label_list:
                raise RuntimeError(
                    f"To initialize the label list we need a label list to include all unique values, these are missing: {labels_not_in_label_list}"
                )
        else:
            label_list = sorted(unique_labels)
        return label_list

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

    def set_label_list(
        self,
        new_labels: list[str] | list[int],
        on_missing_labels=LabelListErrorResponse.ERROR,
    ):
        if not new_labels:
            raise ValueError("No labels given")

        if new_labels == self.label_list:
            return

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

        old_values = self._coded_values
        new_values = numpy.full_like(self._coded_values, fill_value=0)
        for label, new_code in new_label_coding.items():
            if label in old_label_coding:
                old_code = old_label_coding[label]
            else:
                continue
            new_values[old_values == old_code] = new_code
        self._coded_values = new_values
        self._label_coding = new_label_coding
        self._notify("label_list")

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
    # Packed bitmask encoded as base64 string (JSON-friendly).
    lasso_mask_t = traitlets.Unicode(default_value="").tag(sync=True)
    # Dict message Python -> TS acknowledging the last request (ok/error).
    lasso_result_t = traitlets.Dict(default_value={}).tag(sync=True)

    def __init__(self, xyz: numpy.ndarray, category: Category):
        super().__init__()
        self._category_cb_id: int | None = None

        if category is not None and xyz.shape[0] != category.num_values:
            raise ValueError(
                f"The number of points ({xyz.shape[0]}) should match "
                f"the number of values in the category: {category.num_values}"
            )

        # Keep a stable callback object so unsubscribe works.
        self._category_cb = self._on_category_changed

        self._xyz = None
        self._category = None
        self.xyz = xyz
        self.category = category

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

        return xyz_f32, xyz_f32.tobytes(order="C")

    def _get_xyz(self) -> numpy.ndarray:
        if self._xyz is None:
            raise RuntimeError("xyz has not been set")
        return self._xyz.copy()

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
        """
        Returns boolean mask of length N (num_points).
        Expects packed bits, bitorder='big', length >= ceil(N/8).

        mask_payload may be:
          - base64 str (from frontend via JSON), or
          - bytes/bytearray (if a binary channel is used)
        """

        n = self.num_points
        needed = (n + 7) // 8

        if isinstance(mask_payload, str):
            # tolerate empty string
            if mask_payload == "":
                raise ValueError("lasso_mask_t is empty")
            mask_bytes = base64.b64decode(mask_payload)
        elif isinstance(mask_payload, (bytes, bytearray)):
            mask_bytes = bytes(mask_payload)
        else:
            raise ValueError(
                f"lasso_mask_t must be base64 str or bytes, got {type(mask_payload)}"
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
