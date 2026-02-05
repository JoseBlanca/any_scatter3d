from pathlib import Path
import subprocess
import shutil
import zipfile
import json

PROJECT_DIR = Path(__file__).parent
PYPROJECT_TOML = PROJECT_DIR / "pyproject.toml"
PYTHON_TEST_DIR = PROJECT_DIR / "test"
TS_PROJECT_DIR = PROJECT_DIR / "frontend"
PYTHON_SRC_DIR = PROJECT_DIR / "src"
PYTHON_SRC_PACKAGE_DIR = PYTHON_SRC_DIR / "scatter3d"
TS_COMPILED_DIR = PYTHON_SRC_PACKAGE_DIR / "static"

if not PYPROJECT_TOML.exists():
    raise RuntimeError(
        "The current working dir is not a project dir with a pyproject.toml file"
    )


def run_cmd(cmd, cwd=None):
    """
    Run a command for the release process.

    - Captures stdout/stderr.
    - On failure, prints both before re-raising.
    - On success, stays quiet.
    """
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print("Command failed:", " ".join(cmd))
        if cwd is not None:
            print(f"(cwd: {cwd})")
        print("\n--- stdout ---")
        print(e.stdout or "")
        print("\n--- stderr ---")
        print(e.stderr or "")
        print("---------------")
        raise


def clean_dist(project_dir: Path) -> None:
    dist_dir = project_dir / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir()
    print("dist/ cleaned")


def check_python_tests(dir):
    cmd = ["uv", "run", "pytest", str(dir)]
    run_cmd(cmd)
    print("Python tests are OK")


def check_ts_tests(dir: Path):
    if not dir.is_dir():
        raise ValueError(f"Not a directory: {dir}")

    cmd = ["npm", "run", "test:run"]

    run_cmd(cmd, cwd=dir)
    print("Ts tests are OK")


def clean_caches_in_python_src(dir: Path):
    for path in dir.iterdir():
        if path.name in ("__marimo__", "__pycache__"):
            shutil.rmtree(path)


def build_ts(ts_project_dir, ts_compiled_dir):
    if ts_compiled_dir.exists():
        shutil.rmtree(ts_compiled_dir)
    ts_compiled_dir.mkdir()
    cmd = ["npm", "run", "build"]
    run_cmd(cmd, cwd=ts_project_dir)

    # Hard assertion: build must produce expected artifacts in the Python package static dir.
    js = ts_compiled_dir / "scatter3d.js"
    js_map = ts_compiled_dir / "scatter3d.js.map"

    if not js.is_file():
        raise RuntimeError(
            "TypeScript build did not produce scatter3d.js in "
            f"{ts_compiled_dir}. Check your frontend build output configuration."
        )
    # Ensure no sourcemap is shipped (even if leftover from a previous build).
    js_map = ts_compiled_dir / "scatter3d.js.map"
    if js_map.exists():
        js_map.unlink()
    if js_map.is_file():
        raise RuntimeError(
            "TypeScript produced scatter3d.js.map in "
            f"{ts_compiled_dir}. Check your frontend build output configuration."
        )

    print("Ts built")


def build_python_package(project_dir):
    cmd = ["uv", "build"]
    run_cmd(cmd, cwd=project_dir)
    print("Python package built")


def check_built_wheel_contents(project_dir: Path) -> None:
    dist_dir = project_dir / "dist"
    if not dist_dir.is_dir():
        raise RuntimeError(f"dist/ not found at {dist_dir} (did build run?)")

    wheels = sorted(
        dist_dir.glob("*.whl"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not wheels:
        raise RuntimeError(f"No .whl files found in {dist_dir}")

    wheel_path = wheels[0]

    required = [
        "scatter3d/__init__.py",
        "scatter3d/scatter3d.py",
        "scatter3d/static/scatter3d.js",
    ]
    forbidden_substrings = [
        "__pycache__/",
        "__marimo__/",
    ]
    forbidden_suffixes = [
        ".pyc",
        ".pyo",
        ".js.map",
    ]

    with zipfile.ZipFile(wheel_path, "r") as zf:
        names = set(zf.namelist())

    # Required files must exist
    missing = [p for p in required if p not in names]
    if missing:
        raise RuntimeError(
            f"Wheel {wheel_path.name} is missing required files: {missing}"
        )

    # Static dir must not be empty (defensive)
    static_files = [
        n for n in names if n.startswith("scatter3d/static/") and not n.endswith("/")
    ]
    if not static_files:
        raise RuntimeError(
            f"Wheel {wheel_path.name} has no files under scatter3d/static/"
        )

    # Forbidden files must not exist
    bad = []
    for n in names:
        if any(s in n for s in forbidden_substrings) or any(
            n.endswith(suf) for suf in forbidden_suffixes
        ):
            bad.append(n)
    if bad:
        raise RuntimeError(
            f"Wheel {wheel_path.name} contains forbidden files (packaging leak): {sorted(bad)[:20]}"
        )

    print(f"Built wheel content OK: {wheel_path.name}")


clean_dist(PROJECT_DIR)
check_python_tests(PYTHON_TEST_DIR)
check_ts_tests(TS_PROJECT_DIR)
clean_caches_in_python_src(PYTHON_SRC_PACKAGE_DIR)
build_ts(TS_PROJECT_DIR, TS_COMPILED_DIR)
build_python_package(PROJECT_DIR)
check_built_wheel_contents(PROJECT_DIR)
