# Star Citizen Datamine Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Python CLI and PySide6 desktop app to the existing `sc-items` repo so it can index Star Citizen game data into JSON and SQLite, show run history and category counts, and remain easy for Codex to run and inspect.

**Architecture:** Keep all parsing, export, and database logic in a shared Python package so the CLI and desktop UI call the same code. Preserve the existing Star Citizen web app assets at the repo root, and add the new Python tool under a dedicated `python-tool/` area with predictable output folders and a JSON run manifest for Codex-friendly automation.

**Tech Stack:** Python 3.10+, Typer, PySide6, SQLite, JSON, pytest, PyInstaller later for packaging

---

### Task 1: Create the Python tool scaffold

**Files:**
- Create: `python-tool/pyproject.toml`
- Create: `python-tool/src/scdm/__init__.py`
- Create: `python-tool/src/scdm/config.py`
- Create: `python-tool/src/scdm/paths.py`
- Create: `python-tool/src/scdm/manifest.py`
- Create: `python-tool/src/scdm/logging.py`
- Create: `python-tool/src/scdm/__main__.py`
- Create: `python-tool/tests/test_config.py`
- Create: `python-tool/tests/test_paths.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

from scdm.config import load_config
from scdm.paths import resolve_workspace_paths


def test_load_config_defaults(tmp_path: Path):
    cfg = load_config(tmp_path / "missing.toml")
    assert cfg.output_dir.name == "data"
    assert cfg.app_name == "scdm"


def test_resolve_workspace_paths(tmp_path: Path):
    paths = resolve_workspace_paths(tmp_path)
    assert paths.root == tmp_path
    assert paths.data_dir == tmp_path / "data"
    assert paths.db_dir == tmp_path / "data" / "db"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_config.py python-tool/tests/test_paths.py -v`
Expected: FAIL because `scdm` modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppConfig:
    app_name: str = "scdm"
    output_dir: Path = Path("data")


def load_config(path: Path) -> AppConfig:
    return AppConfig()
```

```python
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path
    data_dir: Path
    db_dir: Path


def resolve_workspace_paths(root: Path) -> WorkspacePaths:
    data_dir = root / "data"
    return WorkspacePaths(root=root, data_dir=data_dir, db_dir=data_dir / "db")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_config.py python-tool/tests/test_paths.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/pyproject.toml python-tool/src/scdm python-tool/tests/test_config.py python-tool/tests/test_paths.py
git commit -m "feat: scaffold star citizen python tool"
```

### Task 2: Add manifest and logging support

**Files:**
- Create: `python-tool/src/scdm/manifest.py`
- Create: `python-tool/src/scdm/logging.py`
- Create: `python-tool/tests/test_manifest.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

from scdm.manifest import RunManifest, write_run_manifest, read_latest_run_manifest


def test_round_trip_manifest(tmp_path: Path):
    manifest = RunManifest(
        started_at="2026-06-20T12:00:00-04:00",
        finished_at="2026-06-20T12:01:00-04:00",
        status="ok",
        source_root=Path("C:/Games/StarCitizen/LIVE"),
        output_root=tmp_path / "data",
        json_count=12,
        record_count=340,
        category_counts={"weapons": 10, "vehicles": 4},
        warnings=[],
    )
    path = write_run_manifest(tmp_path, manifest)
    loaded = read_latest_run_manifest(tmp_path)
    assert path.exists()
    assert loaded.json_count == 12
    assert loaded.category_counts["vehicles"] == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_manifest.py -v`
Expected: FAIL because manifest helpers are missing.

- [ ] **Step 3: Write minimal implementation**

```python
from dataclasses import asdict, dataclass
from datetime import datetime
import json
from pathlib import Path


@dataclass(frozen=True)
class RunManifest:
    started_at: str
    finished_at: str
    status: str
    source_root: Path
    output_root: Path
    json_count: int
    record_count: int
    category_counts: dict[str, int]
    warnings: list[str]


def write_run_manifest(root: Path, manifest: RunManifest) -> Path:
    runs_dir = root / "data" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    path = runs_dir / "latest.json"
    payload = asdict(manifest)
    payload["source_root"] = str(payload["source_root"])
    payload["output_root"] = str(payload["output_root"])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path
```

```python
from pathlib import Path

def setup_logging(log_dir: Path) -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / "scdm.log"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_manifest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/src/scdm/manifest.py python-tool/src/scdm/logging.py python-tool/tests/test_manifest.py
git commit -m "feat: add run manifest support"
```

### Task 3: Build the SQLite schema and JSON export layer

**Files:**
- Create: `python-tool/src/scdm/database.py`
- Create: `python-tool/src/scdm/exporters.py`
- Create: `python-tool/tests/test_database.py`
- Create: `python-tool/tests/test_exporters.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

from scdm.database import init_db, upsert_records, count_by_category


def test_db_counts_by_category(tmp_path: Path):
    db_path = tmp_path / "scdm.sqlite"
    init_db(db_path)
    upsert_records(
        db_path,
        [
            {"source_id": "w1", "category": "weapons", "name": "Laser Cannon", "raw_json": "{}"},
            {"source_id": "v1", "category": "vehicles", "name": "Star Runner", "raw_json": "{}"},
        ],
    )
    counts = count_by_category(db_path)
    assert counts["weapons"] == 1
    assert counts["vehicles"] == 1
```

```python
from pathlib import Path

from scdm.exporters import export_category_json


def test_export_category_json(tmp_path: Path):
    out = export_category_json(
        tmp_path,
        "weapons",
        [{"source_id": "w1", "name": "Laser Cannon"}],
    )
    assert out.name == "weapons.json"
    assert out.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_database.py python-tool/tests/test_exporters.py -v`
Expected: FAIL because the database and exporter modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
import json
import sqlite3
from pathlib import Path


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            create table if not exists records (
              source_id text primary key,
              category text not null,
              name text not null,
              raw_json text not null
            )
            """
        )


def upsert_records(db_path: Path, records: list[dict]) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            """
            insert into records (source_id, category, name, raw_json)
            values (:source_id, :category, :name, :raw_json)
            on conflict(source_id) do update set
              category=excluded.category,
              name=excluded.name,
              raw_json=excluded.raw_json
            """,
            records,
        )


def count_by_category(db_path: Path) -> dict[str, int]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "select category, count(*) from records group by category"
        ).fetchall()
    return {category: count for category, count in rows}
```

```python
import json
from pathlib import Path


def export_category_json(output_root: Path, category: str, records: list[dict]) -> Path:
    json_dir = output_root / "data" / "json"
    json_dir.mkdir(parents=True, exist_ok=True)
    path = json_dir / f"{category}.json"
    path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    return path
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_database.py python-tool/tests/test_exporters.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/src/scdm/database.py python-tool/src/scdm/exporters.py python-tool/tests/test_database.py python-tool/tests/test_exporters.py
git commit -m "feat: add sqlite and json export layer"
```

### Task 4: Build the CLI commands and one-click launcher

**Files:**
- Create: `python-tool/src/scdm/cli.py`
- Create: `python-tool/src/scdm/pipeline.py`
- Create: `python-tool/launch.ps1`
- Create: `python-tool/launch.bat`
- Create: `python-tool/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
from typer.testing import CliRunner

from scdm.cli import app


runner = CliRunner()


def test_status_command():
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "latest run" in result.stdout.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_cli.py -v`
Expected: FAIL because `app` is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```python
import typer

app = typer.Typer()


@app.command()
def status() -> None:
    typer.echo("Latest run: none yet")
```

```python
from pathlib import Path


def run_pipeline(workspace_root: Path) -> dict:
    return {"status": "ok", "json_count": 0, "record_count": 0}
```

```powershell
@echo off
set SCRIPT_DIR=%~dp0
python "%SCRIPT_DIR%src\scdm\__main__.py" status
```

```powershell
Set-Location $PSScriptRoot
python .\src\scdm\__main__.py status
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_cli.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/src/scdm/cli.py python-tool/src/scdm/pipeline.py python-tool/launch.ps1 python-tool/launch.bat python-tool/tests/test_cli.py
git commit -m "feat: add cli and launcher scripts"
```

### Task 5: Add the PySide6 desktop dashboard

**Files:**
- Create: `python-tool/src/scdm/ui/main_window.py`
- Create: `python-tool/src/scdm/ui/models.py`
- Create: `python-tool/src/scdm/ui/app.py`
- Create: `python-tool/tests/test_ui_smoke.py`

- [ ] **Step 1: Write the failing test**

```python
def test_main_window_imports():
    from scdm.ui.main_window import MainWindow

    assert MainWindow is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_ui_smoke.py -v`
Expected: FAIL because the UI package does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
from PySide6.QtWidgets import QMainWindow


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("SC Datamine Dashboard")
```

```python
from PySide6.QtWidgets import QApplication
from scdm.ui.main_window import MainWindow


def main() -> None:
    app = QApplication([])
    window = MainWindow()
    window.show()
    app.exec()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_ui_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/src/scdm/ui python-tool/tests/test_ui_smoke.py
git commit -m "feat: add desktop dashboard shell"
```

### Task 6: Wire the desktop dashboard to run history and data summaries

**Files:**
- Modify: `python-tool/src/scdm/ui/main_window.py`
- Modify: `python-tool/src/scdm/manifest.py`
- Modify: `python-tool/src/scdm/database.py`
- Create: `python-tool/tests/test_dashboard_data.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

from scdm.database import count_by_category
from scdm.manifest import read_latest_run_manifest


def test_dashboard_reads_manifest_and_counts(tmp_path: Path):
    manifest = read_latest_run_manifest(tmp_path)
    assert manifest.status in {"ok", "missing"}
    assert count_by_category(tmp_path / "data" / "db" / "scdm.sqlite") == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests/test_dashboard_data.py -v`
Expected: FAIL because the dashboard data-loading path is incomplete.

- [ ] **Step 3: Write minimal implementation**

```python
def load_dashboard_state(workspace_root: Path) -> dict:
    return {
        "latest_run": None,
        "json_count": 0,
        "record_count": 0,
        "category_counts": {},
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python-tool/tests/test_dashboard_data.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python-tool/src/scdm/ui/main_window.py python-tool/src/scdm/manifest.py python-tool/src/scdm/database.py python-tool/tests/test_dashboard_data.py
git commit -m "feat: connect dashboard to run data"
```

### Task 7: Update repo docs and GitHub sync guidance

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`
- Create: `python-tool/README.md`
- Create: `python-tool/.env.example`

- [ ] **Step 1: Write the failing test**

```python
def test_placeholder():
    assert True
```

This task is docs-only; the check is to verify the repo layout and instructions are complete rather than a code behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python-tool/tests -v`
Expected: All code tests pass; docs are reviewed manually.

- [ ] **Step 3: Write minimal implementation**

Add clear install and run instructions for:

- cloning the GitHub repo
- creating a Python virtual environment
- installing dependencies
- running `python-tool` commands
- launching the desktop app
- keeping generated outputs out of git

- [ ] **Step 4: Run test to verify it passes**

Run: `git status --short`
Expected: only intended docs changes and no generated data files tracked.

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore python-tool/README.md python-tool/.env.example
git commit -m "docs: add python tool usage and repo guidance"
```

### Task 8: Prepare GitHub push and release path

**Files:**
- No code files expected unless a release helper is added later

- [ ] **Step 1: Verify remote and branch**

Run: `git remote -v`
Expected: `origin` points to `https://github.com/Gringonaranjito/sc-items.git`

- [ ] **Step 2: Verify the working tree is ready**

Run: `git status --short`
Expected: only the intended implementation changes are present.

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Confirm the repo can be cloned elsewhere**

Run on a clean machine:

```bash
git clone https://github.com/Gringonaranjito/sc-items.git
cd sc-items
```

Expected: the Python tool, the existing SC web app, and the docs are all present.

