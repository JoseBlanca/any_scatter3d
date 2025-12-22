import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _():
    import random
    from any_scatter3d.scatter3d import Scatter3dWidget

    import numpy as np
    import pandas

    num_points = 2000

    points = np.random.randn(num_points, 3)
    possible_categories = ['species1', 'species2', 'species3']

    points = pandas.DataFrame({
        'x': np.random.randn(num_points),
        'y': np.random.randn(num_points),
        'z': np.random.randn(num_points),
        'category': random.choices(possible_categories, k=num_points)
    })

    w = Scatter3dWidget()
    w.set_points(points)
    w.point_size = 0.2
    w.background = "#ffffff"

    w
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
