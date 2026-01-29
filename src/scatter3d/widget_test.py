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
    countries_list = ["country1", "country2", "country3"]
    countries = random.choices(countries_list, k=num_points)
    countries = Category(pandas.Series(countries, name="countries"))

    species2 = random.choices(species_list, k=num_points)
    species2 = Category(pandas.Series(species2, name="species2"), editable=False)

    w = Scatter3dWidget(xyz=points, category=species, point_ids=point_ids)
    w.height = 800
    ui = marimo.ui.anywidget(w)
    return species, ui, w


@app.cell
def _(species):
    category = species
    return (category,)


@app.cell
def _(category, ui, w):
    w.category = category
    ui
    return


@app.cell
def _(w):
    print(w.active_category)
    return


if __name__ == "__main__":
    app.run()
