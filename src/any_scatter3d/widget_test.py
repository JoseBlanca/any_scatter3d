import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _(xs):
    from any_scatter3d.scatter3d import Scatter3dWidget

    import numpy as np
    import pandas

    num_points = 100000

    points = np.random.randn(num_points, 3)
    points = pandas.DataFrame(points, columns=['x', 'y', 'z'])

    w = Scatter3dWidget()
    w.set_points(points)
    w.point_size = 0.1
    w.background = "#ffffff"
    if False:
        colors = []
        for x in xs:
            if x < 0:
                colors.append([0.2, 0.2, 1.0])  # blue-ish
            else:
                colors.append([1.0, 0.2, 0.2])  # red-ish

        w.point_colors = colors

    w
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
