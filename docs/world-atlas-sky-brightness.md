# World Atlas Sky Brightness Raster V1

This feature adds an optional local sky-brightness raster layer for Milky Way decisions. It is designed for World Atlas style modeled sky brightness or any operator-provided equivalent raster, but the runtime never downloads data and never calls a third-party sky-brightness API.

## Operator Contract

- Put licensed source GeoTIFF/COG files under `deploy/sky-brightness/incoming/`.
- Activate data only through `bash scripts/import-sky-brightness-raster.sh`.
- Inspect the active dataset with `bash scripts/check-sky-brightness-raster.sh`.
- Production Compose mounts `./deploy/sky-brightness:/app/data/sky-brightness`.
- The active files are `current/sky-brightness.cog.tif`, `current/metadata.json`, and `current/checksum.sha256`.
- Generated rasters, metadata, checksums, and backups are ignored by Git.

Example:

```bash
bash scripts/import-sky-brightness-raster.sh incoming/<file-or-directory> -- \
  --value-type sqm \
  --dataset-name "World Atlas modeled sky brightness" \
  --dataset-year 2015 \
  --dataset-version v1
```

Supported `--value-type` values are `sqm`, `artificial_brightness_mcd_m2`, `ratio_to_natural`, `radiance`, `bortle_class`, and `unknown`.

## Runtime Behavior

Astro-service exposes `POST /sky-brightness/query` and also includes `skyBrightness` inside `/astro/calculate`. Missing files, missing metadata, unreadable rasters, out-of-bounds coordinates, nodata samples, and unsupported value types are non-fatal. They reduce confidence and keep deterministic astronomy/weather output available.

Health fields include dataset existence, metadata availability, dataset name/year/version, value type, checksum prefix, health status, and load error. Public UI must not expose provider names or raw operator details outside professional diagnostics.

## Conversion Rules

- `sqm`: treated as a modeled raster-derived sky brightness value only when it is physically plausible.
- `artificial_brightness_mcd_m2`: treated as modeled artificial zenith sky brightness in mcd/m^2, kept separate from the natural-sky luminance baseline, then combined only to derive modeled total sky brightness and modeled SQM.
- `ratio_to_natural`: converted with a natural-sky baseline and widened Bortle uncertainty.
- `bortle_class`: used as a broad modeled class range, without deriving SQM.
- `radiance` and `unknown`: kept as raw diagnostics only; no SQM or Bortle range is fabricated.

Modeled SQM is never presented as measured SQM. Artificial brightness, natural baseline, modeled total sky brightness, modeled SQM, and estimated Bortle range are separate diagnostics. Bortle ranges are estimates, not official Bortle observations and not national-standard classifications.

## WA Plus VIIRS Fusion

When a defensible sky-brightness Bortle range exists, it becomes the primary public baseline. The existing VIIRS night-light layer remains useful as current light-source evidence:

- local radiance and halo can widen or lift an over-dark modeled baseline;
- WA 3-4 style moderate darkness plus brighter VIIRS current-light evidence can lift to 4-5 rather than staying anchored to the darker WA low end;
- strong VIIRS conflict prevents narrow dark claims;
- missing WA/model data falls back to the existing conservative VIIRS public display;
- missing VIIRS can fall back to WA/model with low confidence when WA/model is usable;
- raw VIIRS and raw WA/model fields stay in diagnostics.

The public Bortle value is always a fused estimated range. High-confidence output should stay narrow, medium confidence normally uses a two-class range, and wider ranges require a visible uncertainty reason. A model-derived dark-sky reference may be shown only as `暗夜参考：模型估算，非认证`; it is not measured SQM, not an official grade, and not a national-standard classification.

Professional data is grouped as public summary, WA sky-brightness baseline, VIIRS current-light evidence, fusion explanation, DEM terrain status, and collapsed developer diagnostics. Raw internal diagnostic codes and long conversion notes belong only in the developer diagnostics group.

Use coordinate diagnostics to inspect one point without external services:

```bash
bash scripts/diagnose-sky-darkness.sh --coordinate 35.1,112.2 --json --azimuth 135 --label qa
```

Use the QA benchmark wrapper for private reference CSV/JSON files:

```bash
bash scripts/evaluate-sky-darkness-benchmarks.sh deploy/calibration/runtime/bortle-reference.csv --format json --include-coordinates
```

Use `--format json`, `--format csv`, `--format markdown`, or `--format all` for report output. The wrapper also accepts `--json` as a compatibility alias for `--format json`.

No location names, coordinate allowlists, scenic-spot categories, or city/rural/mountain hardcoding are used.

## QA Boundary

Tianwentong screenshots and other third-party references are benchmark QA artifacts only. Reports may label them as `competitorBenchmark`, `thirdPartyReference`, and `notGroundTruth`, but they do not create production thresholds, place mappings, coordinate rules, or category overrides.

The product advantage should come from combining modeled sky brightness, current light-source evidence, weather, Moon, astronomical Milky Way windows, DEM/horizon obstruction, and concrete action advice. It must not claim a more precise single-point SQM, official dark-sky grade, or national-standard level.
