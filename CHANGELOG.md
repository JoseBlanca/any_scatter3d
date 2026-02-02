## 0.1.8 - 2026-02-02
### Bug fix
    - In some cases there could be a temporary mismatch between traitlets.

## 0.1.7 - 2026-02-01
### Bug fix
    - Label selection was not working.

## 0.1.6 - 2026-01-30
### Bug fix
    - Crash fixed when category was changed while a label was selected.

## 0.1.5 - 2026-01-29
### Added
- Categories can be not editable
- active_category is now a public property

## 0.1.4 - 2026-01-28
### Bug fix
- In marimo run mode the widget had no height

## 0.1.3 - 2026-01-18
### Added
- Possibility of changing the widget height through the Python interface

### Changed
- Internal cleanup/refactors.

## 0.1.2 - 2026-01-12
### Added
- Legend UI improvements: selected label highlight/background; legend positioned as an overlay on the canvas.
- Stricter typing and additional runtime checks around legend + lasso transport payloads.

### Fixed
- Lasso selection coordinate mismatch between overlay interaction and the 3D scene.
- Keyboard handling: ensure Enter key press is always detected.
- Multiple type/typing errors and a transport coding error affecting message handling.

### Changed
- Dependency upgrades.
- Internal cleanup/refactors and test suite updates to cover readiness checks and legend/transport behavior.
