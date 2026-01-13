import numpy
import pandas
import pytest
import traitlets

from scatter3d.scatter3d import Scatter3dWidget, Category


def test_xyz_bytes_t_packs_float32_row_major():
    # Use a dtype that is not float32 to ensure conversion is tested.
    xyz = numpy.array(
        [
            [1.0, 2.0, 3.0],
            [4.5, 5.5, 6.5],
        ],
        dtype=numpy.float64,
    )

    w = Scatter3dWidget(xyz=xyz, category=Category(pandas.Series([1, 1])))

    # Contract: the widget packs (x, z, y) so that user z becomes "up" (Y) in Three.js.
    expected_xyz = numpy.asarray(xyz, dtype=numpy.float32, order="C").copy()
    expected_xyz[:, [1, 2]] = expected_xyz[:, [2, 1]]
    expected = expected_xyz.tobytes(order="C")

    assert w.xyz_bytes_t == expected
    assert isinstance(w.xyz_bytes_t, (bytes, bytearray))

    # Round-trip decode: matches packed order (x, z, y)
    decoded = numpy.frombuffer(w.xyz_bytes_t, dtype=numpy.float32).reshape(-1, 3)
    numpy.testing.assert_allclose(decoded, expected_xyz)


def test_xyz_property_round_trips_in_user_order_xyz():
    xyz = numpy.array(
        [
            [1.0, 2.0, 3.0],
            [4.5, 5.5, 6.5],
        ],
        dtype=numpy.float64,
    )

    w = Scatter3dWidget(xyz=xyz, category=Category(pandas.Series([1, 1])))

    # Public API: w.xyz should return user-space (x, y, z) order,
    # even though internal storage/packed bytes are (x, z, y).
    got = w.xyz
    expected = xyz.astype(numpy.float32)

    numpy.testing.assert_allclose(got, expected)


def test_labels_t_and_coded_values_t_are_synced_from_category():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    # Control label order explicitly: Italy=1, Spain=2
    cat = Category(values=s, label_list=["Italy", "Spain"])

    xyz = numpy.arange(12, dtype=numpy.float32).reshape(4, 3)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # labels_t should match label_list (as strings)
    assert w.labels_t == ["Italy", "Spain"]

    # coded_values_t should decode to expected uint16 codes
    decoded = numpy.frombuffer(w.coded_values_t, dtype=numpy.uint16)
    assert decoded.shape == (4,)

    # expected codes: Spain->2, Italy->1, None->0, Spain->2
    expected = numpy.array([2, 1, 0, 2], dtype=numpy.uint16)
    numpy.testing.assert_array_equal(decoded, expected)


def test_coded_values_t_updates_when_category_set_label_list_changes_codes():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    cat = Category(values=s, label_list=["Italy", "Spain"])

    xyz = numpy.zeros((4, 3), dtype=numpy.float32)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # Now swap label order -> codes should be Italy=2, Spain=1
    cat.set_label_list(["Spain", "Italy"])

    assert w.labels_t == ["Spain", "Italy"]
    decoded = numpy.frombuffer(w.coded_values_t, dtype=numpy.uint16)
    expected = numpy.array([1, 2, 0, 1], dtype=numpy.uint16)  # Spain->1, Italy->2
    numpy.testing.assert_array_equal(decoded, expected)


def pack_mask_big(indices: list[int], n: int) -> bytes:
    """
    Packed bits, bitorder='big'. Point i is bit (7-(i%8)) in byte i//8.
    """
    bits = numpy.zeros(n, dtype=numpy.uint8)
    bits[numpy.array(indices, dtype=numpy.int64)] = 1
    packed = numpy.packbits(bits, bitorder="big")
    return packed.tobytes(order="C")


def decode_u16(buf: bytes) -> numpy.ndarray:
    return numpy.frombuffer(buf, dtype=numpy.uint16)


def test_lasso_add_with_packed_bitmask():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    cat = Category(values=s, label_list=["Italy", "Spain"])  # Italy=1, Spain=2

    xyz = numpy.zeros((4, 3), dtype=numpy.float32)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # select indices [1,2]
    mask_bytes = pack_mask_big([1, 2], n=4)
    w.lasso_mask_t = mask_bytes

    w.lasso_request_t = {
        "kind": "lasso_commit",
        "op": "add",
        "label": "Spain",
        "request_id": 1,
    }

    assert w.lasso_result_t["status"] == "ok"
    decoded = decode_u16(w.coded_values_t)
    expected = numpy.array([2, 2, 2, 2], dtype=numpy.uint16)
    numpy.testing.assert_array_equal(decoded, expected)


def test_lasso_remove_with_packed_bitmask_only_removes_target_label():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    cat = Category(values=s, label_list=["Italy", "Spain"])  # Italy=1, Spain=2

    xyz = numpy.zeros((4, 3), dtype=numpy.float32)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # select indices [0,1,3] and remove Spain
    mask_bytes = pack_mask_big([0, 1, 3], n=4)
    w.lasso_mask_t = mask_bytes

    w.lasso_request_t = {
        "kind": "lasso_commit",
        "op": "remove",
        "label": "Spain",
        "request_id": 2,
    }

    assert w.lasso_result_t["status"] == "ok"
    decoded = decode_u16(w.coded_values_t)
    expected = numpy.array([0, 1, 0, 0], dtype=numpy.uint16)
    numpy.testing.assert_array_equal(decoded, expected)


def test_lasso_mask_too_short_errors_and_state_unchanged():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    cat = Category(values=s, label_list=["Italy", "Spain"])

    xyz = numpy.zeros((4, 3), dtype=numpy.float32)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    before = decode_u16(w.coded_values_t).copy()

    w.lasso_mask_t = b""  # too short for N=4 (needs 1 byte)
    w.lasso_request_t = {
        "kind": "lasso_commit",
        "op": "add",
        "label": "Spain",
        "request_id": 3,
    }

    assert w.lasso_result_t["status"] == "error"
    after = decode_u16(w.coded_values_t)
    numpy.testing.assert_array_equal(after, before)


def test_lasso_unknown_label_errors_and_state_unchanged():
    s = pandas.Series(["Spain", "Italy", None, "Spain"], name="country")
    cat = Category(values=s, label_list=["Italy", "Spain"])

    xyz = numpy.zeros((4, 3), dtype=numpy.float32)
    w = Scatter3dWidget(xyz=xyz, category=cat)

    before = decode_u16(w.coded_values_t).copy()

    mask_bytes = pack_mask_big([0, 1], n=4)
    w.lasso_mask_t = mask_bytes

    w.lasso_request_t = {
        "kind": "lasso_commit",
        "op": "add",
        "label": "Portugal",
        "request_id": 4,
    }

    assert w.lasso_result_t["status"] == "error"
    after = decode_u16(w.coded_values_t)
    numpy.testing.assert_array_equal(after, before)


def test_entering_lasso_selects_first_label():
    xyz = numpy.zeros((3, 3), dtype=numpy.float32)
    cat = Category(pandas.Series(["b", "a", "b"]))  # label_list sorted -> ["a","b"]
    w = Scatter3dWidget(xyz=xyz, category=cat)

    assert w.interaction_mode_t == "rotate"
    assert w.active_category_t is None

    w.interaction_mode_t = "lasso"
    assert w.active_category_t == "a"


def test_cannot_clear_active_category_in_lasso_mode():
    xyz = numpy.zeros((3, 3), dtype=numpy.float32)
    cat = Category(pandas.Series(["a", "b", "b"]))
    w = Scatter3dWidget(xyz=xyz, category=cat)

    w.interaction_mode_t = "lasso"
    assert w.active_category_t in ("a", "b")

    with pytest.raises(traitlets.TraitError):
        w.active_category_t = None


def test_can_clear_active_category_in_rotate_mode():
    xyz = numpy.zeros((3, 3), dtype=numpy.float32)
    cat = Category(pandas.Series(["a", "b", "b"]))
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # Rotate mode is default
    assert w.interaction_mode_t == "rotate"

    # Set a valid active category, then clear it: must be allowed in rotate mode.
    w.active_category_t = "a"
    w.active_category_t = None
    assert w.active_category_t is None


def test_zero_point_category_is_present_and_selectable():
    xyz = numpy.zeros((3, 3), dtype=numpy.float32)

    # Only "a" and "b" appear in the values, but we force label_list to include "c" (zero points).
    cat = Category(pandas.Series(["a", "b", "b"]), label_list=["a", "b", "c"])
    w = Scatter3dWidget(xyz=xyz, category=cat)

    # Must be present in the synced labels
    assert w.labels_t == ["a", "b", "c"]

    # Rotate mode: selecting "c" must be allowed
    w.active_category_t = "c"
    assert w.active_category_t == "c"

    # Lasso mode: "c" must also be selectable and non-empty enforced
    w.interaction_mode_t = "lasso"
    w.active_category_t = "c"
    assert w.active_category_t == "c"


def test_cannot_enter_lasso_mode_when_no_labels():
    xyz = numpy.zeros((0, 3), dtype=numpy.float32)
    cat = Category(pandas.Series([], dtype="object"), label_list=[])

    w = Scatter3dWidget(xyz=xyz, category=cat)
    assert w.labels_t == []

    with pytest.raises(RuntimeError, match="labels_t is empty"):
        w.interaction_mode_t = "lasso"
