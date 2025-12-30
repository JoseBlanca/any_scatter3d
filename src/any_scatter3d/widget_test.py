import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import random
    from any_scatter3d import Scatter3dWidget, Category

    import numpy as np
    import pandas

    num_points = 100

    points = np.random.randn(num_points, 3)
    species_list = ['species1', 'species2', 'species3']
    species = random.choices(species_list, k=num_points)
    species = Category(pandas.Series(species, name='species'))

    w = Scatter3dWidget(xyz=points, category=species)
    w.count = 100
    w
    return (w,)


@app.cell
def _(w):
    print(w.category)
    return


if __name__ == "__main__":
    app.run()
