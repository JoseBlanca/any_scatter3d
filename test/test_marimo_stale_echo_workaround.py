import numpy as np
import pandas as pd

from scatter3d.scatter3d import Scatter3dWidget, Category


def test_set_state_resyncs_python_owned_traits_when_inbound_contains_them(monkeypatch):
    xyz = np.zeros((5, 3), dtype=np.float32)
    cat = Category(
        pd.Series(["A"] * 5, dtype="object"), label_list=["A"], editable=False
    )
    w = Scatter3dWidget(xyz=xyz, category=cat, point_ids=list(range(5)))

    # Pretend the frontend is ready so send_state should be used.
    w.interactive_ready_t = True

    sent = []
    monkeypatch.setattr(w, "send_state", lambda name: sent.append(name))

    # Simulate a marimo stale echo: inbound includes python-owned keys that should be dropped
    w.set_state(
        {
            "interactive_ready_t": True,
            "coded_values_t": b"\x00\x00\x01\x00",  # bogus/stale payload
            "colors_t": [[1.0, 0.0, 0.0]],
        }
    )

    # The workaround must force a resync of the authoritative traits
    assert "coded_values_t" in sent
    assert "colors_t" in sent
    assert "labels_t" in sent
    assert "missing_color_t" in sent
    assert "category_editable_t" in sent
