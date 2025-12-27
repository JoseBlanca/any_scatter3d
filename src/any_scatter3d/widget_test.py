import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import random
    from any_scatter3d import Scatter3dWidget

    import numpy as np
    import pandas

    num_points = 100

    points = np.random.randn(num_points, 3)
    possible_species = ['species1', 'species2', 'species3']
    possible_sizes = ['small', 'medium', 'big']

    points = pandas.DataFrame({
        'x': np.random.randn(num_points),
        'y': np.random.randn(num_points),
        'z': np.random.randn(num_points),
        'cat_species': random.choices(possible_species, k=num_points),
        'cat_sizes': random.choices(possible_sizes, k=num_points)
    })

    w = Scatter3dWidget(dframe=points, categories_cols=["cat_species", "cat_sizes"])
    w.count = 100
    w
    return (w,)


@app.cell
def _(w):
    print(w.get_classifications(["cat_sizes"]))
    return


if __name__ == "__main__":
    app.run()
