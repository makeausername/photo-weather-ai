# Bortle Calibration Mismatch Investigation

This workflow audits the production Bortle estimator against independent reference ranges. It does not change production thresholds, astronomy scoring, light-pollution API output, or public UI behavior.

## Run

Use a CSV or JSON reference file with WGS84 coordinates and optional reference ranges:

```bash
pnpm bortle:calibrate -- --input deploy/calibration/bortle-reference.example.csv --strict
```

Useful options:

- `--dry-run` validates input only and sends no astro-service queries.
- `--redact-names` replaces point names with ids and removes reference notes.
- `--include-coordinates` keeps the legacy nested `coordinates` object in JSON output. The raw audit fields still include `latitudeWgs84` and `longitudeWgs84`.
- `--fail-on-query-error` exits non-zero when any astro-service light-pollution query fails.

Generated reports are written under `deploy/calibration/runtime/`, which is ignored by Git.

## Output Files

Each non-dry-run creates the selected legacy report formats plus four investigation files:

- `bortle-calibration-<timestamp>.json`: full audit report with raw point diagnostics.
- `bortle-calibration-<timestamp>.csv`: flat CSV version of the full audit report.
- `bortle-calibration-<timestamp>.md`: Markdown summary with mismatch grouping.
- `bortle-calibration-<timestamp>-mismatches.csv`: only rows needing investigation.
- `bortle-calibration-<timestamp>-mismatches.json`: JSON mismatch report with reason flags.
- `bortle-calibration-<timestamp>-candidate-analysis.md`: candidate-threshold simulation summary.
- `bortle-calibration-<timestamp>-candidate-analysis.json`: machine-readable candidate analysis.

Mismatch files include range non-overlaps, distance greater than one class, saturated ambient risk, suspicious local/halo ratios, and zero or near-zero local radiance that still produces a Bortle 1 estimate.

## Diagnostic Model

The audit keeps four concepts separate:

- Raster measurement: EOG VIIRS satellite night-light values and derived local/halo risk fields.
- Current deterministic estimate: the existing production Bortle estimator result.
- Third-party reference range: user-supplied Tianwentong screenshot values.
- Candidate offline simulation: deterministic audit-only threshold experiments.

Tianwentong screenshot values are third-party model references. They are not SQM field measurements and should not be described as physical ground truth.

Each point records local radiance, surrounding halo radiance, local/halo ratios, ambient risk index and level, raster confidence, dataset year/version, range distance, overlap, bias direction, saturation flags, zero/near-zero local radiance, and ratio-threshold diagnostics.

## Candidate Analysis

Candidate mappings are generated globally and monotonically from the available reference points and raster-derived values. They do not use location names, coordinates, category-specific production rules, mountain/city/rural special cases, or separate per-category threshold tables.

The current candidate set compares:

- Current production mapping.
- Ambient-risk reference thresholds.
- Composite local-radiance and surrounding-halo thresholds.

The composite candidate keeps surrounding halo as an independent contributor, so a zero or near-zero local radiance point near a strong halo is not automatically treated as a perfect Bortle 1 sky. Leave-one-out cross-validation is deterministic and uses no random seed.

## Evidence Sufficiency

A candidate must not be considered for production review unless all gates pass:

- At least 50 valid reference locations.
- At least five meaningful environment categories.
- No single category exceeds 50% of references.
- At least 80% high-confidence raster results.
- Candidate reduces disagreements greater than one class.
- Candidate does not materially worsen urban or dark-site results.
- Candidate improves or maintains median class distance.
- Candidate mapping remains monotonic and keeps middle bands available.
- Reference sources are clearly documented.

The current 30 screenshot-derived references are useful for investigating specific mismatches, but they are insufficient for automatic threshold replacement. Future references should prefer real SQM measurements or independently verified Bortle observations, include source documentation, cover diverse environments, and avoid over-representing one category.

Production thresholds remain unchanged until a separate, reviewed production change explicitly updates them.
