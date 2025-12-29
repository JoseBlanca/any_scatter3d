import numpy
import pandas
import polars
import pytest

from any_scatter3d.scatter3d import Category, LabelListErrorResponse


def get_test_series():
    series1 = {
        "values": pandas.Series(
            [2, 2, 3, 1, 2, pandas.NA], name="classes", dtype=pandas.Int64Dtype()
        ),
        "name": "classes",
        "label_list": [1, 2, 3],
    }
    series2 = {
        "values": polars.Series("species1", ["species2", "species1", "species3", None]),
        "name": "species1",
        "label_list": ["species1", "species2", "species3"],
    }
    series3 = {
        "values": pandas.Series(
            ["species2", "species1", "species3", None], name="species2", dtype=str
        ),
        "name": "species2",
        "label_list": ["species1", "species2", "species3"],
    }
    series4 = {
        "values": pandas.Series(
            ["species2", "species1", "species3", None],
            name="species3",
            dtype=pandas.StringDtype(),
        ),
        "name": "species3",
        "label_list": ["species1", "species2", "species3"],
    }
    series5 = {
        "values": pandas.Series([2, 2, 3, 1, 2], name="classes2", dtype=int),
        "name": "classes2",
        "label_list": [1, 2, 3],
    }
    return [series1, series2, series3, series4, series5]


def test_category_init():
    for series in get_test_series():
        category = Category(series["values"])
        assert series["values"].equals(category.values)
        assert series["name"] == category.name

    values = pandas.Series([2, 2, 3, 1, 2], name="classes2", dtype=int)
    category = Category(values=values, label_list=[3, 1, 2])
    assert values.equals(category.values)
    assert category.label_list == [3, 1, 2]


def test_label_list():
    for series in get_test_series():
        category = Category(series["values"])
        assert category.label_list == series["label_list"]


def test_remove_label():
    category = Category(get_test_series()[0]["values"])
    with pytest.raises(ValueError):
        category.set_label_list([1, 2])

    assert list(category.coded_values) == [2, 2, 3, 1, 2, 0]
    assert category.label_coding == [(1, 1), (2, 2), (3, 3)]
    category.set_label_list(
        [1, 2], on_missing_labels=LabelListErrorResponse.SET_MISSING
    )
    assert category.values.equals(
        pandas.Series(
            [2, 2, pandas.NA, 1, 2, pandas.NA],
            name="classes",
            dtype=pandas.Int64Dtype(),
        )
    )
    assert list(category.coded_values) == [2, 2, 0, 1, 2, 0]
    assert category.label_coding == [(1, 1), (2, 2)]

    category.set_label_list([1, 2, 3, 4])
    assert category.values.equals(
        pandas.Series(
            [2, 2, pandas.NA, 1, 2, pandas.NA],
            name="classes",
            dtype=pandas.Int64Dtype(),
        )
    )
    assert list(category.coded_values) == [2, 2, 0, 1, 2, 0]
    assert category.label_coding == [(1, 1), (2, 2), (3, 3), (4, 4)]

    category.set_label_list([2, 1, 3, 4])
    assert category.values.equals(
        pandas.Series(
            [2, 2, pandas.NA, 1, 2, pandas.NA],
            name="classes",
            dtype=pandas.Int64Dtype(),
        )
    )
    assert list(category.coded_values) == [1, 1, 0, 2, 1, 0]
    assert category.label_coding == [(2, 1), (1, 2), (3, 3), (4, 4)]


def test_mutate_coded_labels():
    category = Category(get_test_series()[0]["values"])
    coded_values = category.coded_values
    new_values = numpy.array([0, 2, 2, 1, 2, 1], dtype=coded_values.dtype)
    category.set_coded_values(new_values, label_list=category.label_list)
    assert numpy.all(numpy.equal(new_values, category.coded_values))
