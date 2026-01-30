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
    species = Category(pandas.Series(species, name="species"), editable=False)
    countries_list = ["country1", "country2", "country3"]
    countries = random.choices(countries_list, k=num_points)
    countries = Category(pandas.Series(countries, name="countries"))

    species2 = random.choices(species_list, k=num_points)
    species2 = Category(pandas.Series(species2, name="species2"), editable=False)

    w = Scatter3dWidget(xyz=points, category=species, point_ids=point_ids)
    w.height = 800
    ui = marimo.ui.anywidget(w)
    return Scatter3dWidget, countries, ui, w


@app.cell
def _(countries):
    category = countries
    return (category,)


@app.cell
def _(category, ui, w):
    w.category = category
    ui
    return


@app.cell
def _(w):
    widget = w

    print("AFTER click:",
          "mode=", widget.interaction_mode_t,
          "editable=", widget.category_editable_t,
          "active=", widget.active_category_t)

    return


@app.cell
def _():
    return


@app.cell
def _(Scatter3dWidget):
    import scatter3d, inspect

    print("scatter3d module:", scatter3d.__file__)
    print("Scatter3dWidget source:", inspect.getsourcefile(Scatter3dWidget))
    print("Scatter3dWidget._sync_traitlets_from_category line:", Scatter3dWidget._sync_traitlets_from_category.__code__.co_firstlineno)
    return


if __name__ == "__main__":
    app.run()
