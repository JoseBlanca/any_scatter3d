import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import random
    from any_scatter3d import Scatter3dWidget, Category, LabelListErrorResponse

    import marimo
    import numpy as np
    import pandas

    num_points = 10000

    points = np.random.randn(num_points, 3)
    species_list = ['species1', 'species2', 'species3']
    species = random.choices(species_list, k=num_points)
    species = Category(pandas.Series(species, name='species'))

    w = Scatter3dWidget(xyz=points, category=species)
    w.point_size = 0.15
    species.set_label_list(['species1'], on_missing_labels=LabelListErrorResponse.SET_MISSING)
    species.set_label_list(['species1', 'species4'])
    ui = marimo.ui.anywidget(w)
    ui
    return species, ui


@app.cell
def _(species, ui):
    ui.lasso_result_t
    print(species.values.value_counts())
    print(species.num_unassigned)
    return


if __name__ == "__main__":
    app.run()
