import marimo

__generated_with = "0.19.2"
app = marimo.App(width="medium")


@app.cell
def _():
    import random
    from scatter3d import Scatter3dWidget, Category, LabelListErrorResponse
    import marimo
    import numpy as np
    import pandas

    num_points = 100

    point_ids = [f"id_{i}" for i in range(1, num_points + 1)]
    points = np.random.randn(num_points, 3)
    species_list = ["species1", "species2", "species3"]
    species = random.choices(species_list, k=num_points)
    species = Category(pandas.Series(species, name="species"))

    w = Scatter3dWidget(xyz=points, category=species, point_ids=point_ids)
    ui = marimo.ui.anywidget(w)
    ui
    return species, ui, w


@app.cell
def _(species, ui, w):
    ui.lasso_result_t
    print(species.values.value_counts())
    print(species.num_unassigned)
    print(species.values)
    print(w.point_ids)
    return


@app.cell
def _(w):
    import inspect
    print(type(w))
    print(inspect.getsource(type(w)._on_lasso_request_t))
    return


if __name__ == "__main__":
    app.run()
