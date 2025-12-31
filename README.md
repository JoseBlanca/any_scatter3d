# scatter3d-anywidget

**Interactive 3D scatter plots for Python notebooks, with lasso-based selection and categorical annotation.**

`scatter3d-anywidget` provides a high-performance, WebGL-based 3D scatter plot widget built on top of **[anywidget](https://anywidget.dev/)**.
It is designed for exploratory data analysis workflows where users need to **interactively select, assign, and modify categories** on point clouds.

## Features

* **3D scatter visualization** (WebGL / Three.js) (up to tens of thousands of points)
* **Lasso selection** with *add* and *remove* operations
* **Categorical annotation** backed by pandas or Polars Series thanks to [narhwals](https://narwhals-dev.github.io/narwhals/)
* **Bidirectional sync** between Python state and frontend
* Designed for **anywidget**, works well with **marimo** and Jupyter

## Installation

```bash
pip install scatter3d-anywidget
```

Requires Python **≥ 3.13**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Basic usage

Below is a minimal example showing how to:

* Create a 3D scatter plot
* Attach a categorical variable
* Modify category labels programmatically
* Inspect lasso selections from Python

```python
import random
import numpy as np
import pandas as pd
import marimo

from scatter3d import Scatter3dWidget, Category, LabelListErrorResponse

num_points = 10_000

# Generate random 3D points
points = np.random.randn(num_points, 3)

# Create a categorical variable
species_list = ["species1", "species2", "species3"]
species = random.choices(species_list, k=num_points)
species = Category(pd.Series(species, name="species"))

# Create the widget
w = Scatter3dWidget(xyz=points, category=species)
w.point_size = 0.15

# Modify allowed labels
species.set_label_list(
    ["species1"],
    on_missing_labels=LabelListErrorResponse.SET_MISSING,
)

species.set_label_list(["species1", "species4"])

# Display in marimo / Jupyter
ui = marimo.ui.anywidget(w)
ui
```

After interacting with the plot (e.g. lasso selection), you can inspect results from Python:

```python
# Result of the last lasso operation
ui.lasso_result_t

# Category statistics
print(species.values.value_counts())
print(species.num_unassigned)
```

## Concepts

### `Scatter3dWidget`

The main widget. It owns the point cloud, rendering state, and interaction logic.

### `Category`

A wrapper around a categorical vector (pandas or Polars Series) that:

* Encodes categories efficiently
* Tracks unassigned values
* Synchronizes category changes with the frontend

### Lasso interaction

The lasso tool allows:

* Selecting points in screen space
* Adding or removing points from a category
* Reading back selection results in Python

## Project status

This is alpha software that we are using in our research.

Contributions and feedback are welcome.

## License

MIT
