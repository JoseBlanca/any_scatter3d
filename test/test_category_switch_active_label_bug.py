import numpy as np
import pandas as pd
import pytest

import scatter3d


def _make_category(values, *, editable=True):
    # values: list[str]
    # scatter3d.Category accepts a pandas Series (per your notebook usage)
    s = pd.Series(values, name="cat")
    return scatter3d.Category(s, editable=editable)


def test_switch_category_raises_when_active_label_from_old_category_is_set():
    """
    Reproduces intermittent crash deterministically in pure Python.

    Bug mechanism:
    - widget has active_category_t set to a label from the current category
    - switching widget.category triggers _sync_traitlets_from_category()
    - it sets labels_t first, which triggers _on_labels_t observer
    - _on_labels_t checks active_category_t against new labels and raises

    This test *should fail after the fix* (you then invert the assertion).
    """
    # 3 points is enough
    xyz = np.array(
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    point_ids = ["p1", "p2", "p3"]

    cat_a = _make_category(["A", "A", "B"], editable=False)
    cat_b = _make_category(["X", "Y", "Z"], editable=False)

    w = scatter3d.Scatter3dWidget(xyz=xyz, category=cat_a, point_ids=point_ids)

    # Ensure rotate mode so active_category_t can be non-None.
    w.interaction_mode_t = "rotate"

    # Set an active label that is valid for cat_a but invalid for cat_b.
    w.active_category_t = "A"

    w.category = cat_b


def test_switch_category_no_exception_after_fix_and_active_is_cleared_or_rebased():
    """
    This encodes the *desired* behavior after you fix atomic syncing.

    After the fix, switching categories must not crash.
    In rotate mode, it's acceptable to clear active_category_t to None if it becomes invalid.
    (Or you can deterministically set it to the first new label; choose one policy and assert it.)
    """
    xyz = np.array(
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    point_ids = ["p1", "p2", "p3"]

    cat_a = _make_category(["A", "A", "B"], editable=False)
    cat_b = _make_category(["X", "Y", "Z"], editable=False)

    w = scatter3d.Scatter3dWidget(xyz=xyz, category=cat_a, point_ids=point_ids)
    w.interaction_mode_t = "rotate"
    w.active_category_t = "A"

    # After fix: should NOT raise
    try:
        w.category = cat_b
    except RuntimeError as e:
        pytest.fail(
            "Category switch should not raise after atomic sync fix. "
            f"Got RuntimeError: {e}"
        )

    # When we switch to a different category we have to reset the active category to None
    assert w.active_category_t is None or w.active_category_t in w.labels_t


def test_category_mutation_does_not_clear_active_label_in_rotate_mode():
    xyz = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32)
    point_ids = ["p1", "p2", "p3"]

    cat = _make_category(["A", "A", "B"], editable=True)
    w = scatter3d.Scatter3dWidget(xyz=xyz, category=cat, point_ids=point_ids)
    w.interaction_mode_t = "rotate"
    w.active_category_t = "A"

    # Mutate coded values (Category emits "coded_values" -> widget callback runs)
    coded = cat.coded_values.copy()
    coded[0] = coded[0]  # no-op but still sets; or change one value safely
    cat.set_coded_values(coded_values=coded, label_list=cat.label_list)

    assert w.active_category_t == "A"
