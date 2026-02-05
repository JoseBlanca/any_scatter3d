import numpy as np
import pandas as pd
import pytest

from scatter3d.scatter3d import Scatter3dWidget, Category


def _get_on_change_handler(el):
    """
    marimo.UIElement stores the on_change callback internally; the attribute name
    has changed across versions. We try a few common ones and fail loudly.
    """
    for name in ("_on_change", "on_change", "_anywidget_on_change"):
        cb = getattr(el, name, None)
        if callable(cb):
            return cb
    # Fallback: scan attributes for a callable that looks like on_change
    for name in dir(el):
        if "change" in name.lower():
            cb = getattr(el, name, None)
            if callable(cb):
                return cb
    raise RuntimeError("Could not find marimo UIElement on_change callback")


def test_marimo_anywidget_bridge_can_echo_stale_python_owned_traits():
    """
    Reproduces the root cause:

    - marimo.anywidget._convert_value() merges decoded_state into _prev_state
    - then on_change() diffs that merged full-state against widget.get_state()
    - which produces a bogus changed_state that includes stale coded_values_t/colors_t

    We assert marimo attempts to call widget.set_state with python-owned traits.
    """
    marimo = pytest.importorskip("marimo")
    from marimo._plugins.ui._impl.from_anywidget import anywidget as mo_anywidget
    from marimo._plugins.ui._impl.from_anywidget import encode_to_wire

    # --- build a widget and two categories (countries editable -> species non-editable) ---
    xyz = np.zeros((10, 3), dtype=np.float32)

    # editable category (countries): 2 labels
    countries = Category(
        pd.Series(["A"] * 10, dtype="object"), label_list=["A", "B"], editable=True
    )

    # non-editable category (species): 3 labels
    species = Category(
        pd.Series(["species1"] * 10, dtype="object"),
        label_list=["species1", "species2", "species3"],
        editable=False,
    )

    w = Scatter3dWidget(xyz=xyz, category=countries, point_ids=list(range(10)))

    # Wrap once: in real notebooks this wrapper persists while the widget changes
    el = mo_anywidget(w)

    # Intercept *what marimo tries to send into widget.set_state*
    seen_inbound_keys = []

    orig_set_state = w.set_state

    def recording_set_state(sync_data):
        if isinstance(sync_data, dict):
            seen_inbound_keys.append(tuple(sorted(sync_data.keys())))
        return orig_set_state(sync_data)

    w.set_state = recording_set_state  # type: ignore[assignment]

    # --- Step 1: simulate that marimo's _prev_state currently contains COUNTRIES state ---
    # We do this by feeding _convert_value a "full state" wire message containing
    # countries-coded/colors, so el._prev_state becomes "countries".
    #
    # NOTE: we do not need to know exact values; just ensure those keys exist.
    countries_state = {
        "coded_values_t": w.coded_values_t,
        "colors_t": w.colors_t,
        "labels_t": w.labels_t,
    }
    el._convert_value(encode_to_wire(countries_state))  # type: ignore[attr-defined]

    # --- Step 2: now Python switches to SPECIES (the problematic transition) ---
    w.category = species
    w._category = species  # assign category object without syncing traitlets yet

    # --- Step 3: frontend sends a small update (e.g. interactive_ready_t only) ---
    # marimo merges this into _prev_state (still "countries"), creating a wire payload
    # that includes stale coded_values_t/colors_t.
    wire_payload = el._convert_value(encode_to_wire({"interactive_ready_t": True}))  # type: ignore[attr-defined]

    # --- Step 4: marimo on_change diffs this merged state vs widget.get_state()
    # and calls widget.set_state(changed_state), which should (wrongly) include
    # coded_values_t/colors_t from countries.
    on_change = _get_on_change_handler(el)
    on_change(wire_payload)

    assert seen_inbound_keys, "Expected marimo to call widget.set_state at least once"

    # The core assertion: marimo attempted to push python-owned traits back into the widget.
    # (Your filter drops them later; we are proving the SOURCE.)
    pushed = set(seen_inbound_keys[-1])
    assert "coded_values_t" in pushed or "colors_t" in pushed, (
        f"Expected stale python-owned traits to be pushed; got keys={sorted(pushed)}"
    )
