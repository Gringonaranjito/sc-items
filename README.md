# SC Items

Local-first Star Citizen tracker for blueprints, missions, and buy items.

## Run locally

Use `run.ps1` or `launch.bat` to start the local bridge and open the app at `http://127.0.0.1:4173/`.

## Refresh data

The `Update Info` button reloads the local JSON bundle without needing any extra installs.
By default it syncs from the local SCMinersDB export folder configured in `run.ps1`.
If you want it to pull from a hosted manifest instead, set `SCMINERSDB_UPDATE_MANIFEST_URL` before launch.

## GitHub Pages

This repo is prepared for GitHub Pages via `.github/workflows/pages.yml`.
Once the repository is connected to GitHub, enable Pages using the GitHub Actions source.
