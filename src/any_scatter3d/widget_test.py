import marimo

__generated_with = "0.18.4"
app = marimo.App(width="medium")


@app.cell
def _():
    from any_scatter3d.counter import CounterWidget

    CounterWidget()
    return


@app.cell
def _():
    from any_scatter3d.scatter3d import Scatter3dWidget

    import numpy as np

    num_points = 20000

    xs = np.random.randn(num_points).tolist()
    ys = np.random.randn(num_points).tolist()
    zs = np.random.randn(num_points).tolist()

    w = Scatter3dWidget()
    w.set_points(xs, ys, zs)
    w.point_size = 0.05
    w.background = "#ffffff"
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
