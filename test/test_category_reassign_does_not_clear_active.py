import numpy
import pandas

from scatter3d.scatter3d import Scatter3dWidget, Category


def test_reassigning_same_category_object_does_not_clear_active_category():
    xyz = numpy.zeros((3, 3), dtype=numpy.float32)
    cat = Category(
        values=pandas.Series(
            numpy.array(["country1", "country1", "country1"]), name="country"
        ),
        label_list=["country1", "country2", "country3"],
    )

    w = Scatter3dWidget(xyz=xyz, category=cat, point_ids=[1, 2, 3])

    # user selects a label (this is what the legend click does)
    w.active_category_t = "country2"
    assert w.active_category_t == "country2"

    # marimo-style re-run: the same object is assigned again
    w.category = cat

    # must NOT clear selection just because the same object was re-set
    assert w.active_category_t == "country2"
