# Terrain Horizon Obstruction V1

本页定义逐光天气的目标方向地形遮挡模型。V1 先接入星空 / 银河判断，后续可复用到日出、日落、月升月落和风光构图方向。

## 目标

- 用目标方位角和目标高度角判断真实地平线是否遮挡拍摄目标。
- 不把缺失的地形剖面当作无遮挡。
- 在没有 DEM / horizon profile 时只给定性、低置信度提示，不展示伪精确角度。
- 保持 public UI provider-neutral；详细样本、规则和来源只放在折叠的专业数据区域。

## Canonical Model

共享类型位于 `packages/shared/src/types.ts`：

- `TerrainHorizonDirectionSample`：某个方向上的地形地平线样本。
- `TerrainHorizonAssessment`：一次目标方向遮挡判断。
- `TerrainHorizonObstructionLevel`：`clear` / `marginal` / `obstructed` / `unknown`。
- `TerrainHorizonDataSource`：已为 `manual_profile`、`dem_raster`、`open_topo_data`、`mapbox_terrain_rgb`、`aws_terrain_tiles`、`custom_local_dem` 等来源预留。

核心 helper 位于 `packages/terrain/src/horizon-obstruction.ts`。

## Clearance Rule

当同时具备目标几何和可用方向剖面时：

```text
clearance = target altitude - terrain horizon altitude
```

- `clearance >= 3°`：`clear`
- `0° <= clearance < 3°`：`marginal`
- `clearance < 0°`：`obstructed`

只有使用方向剖面、置信度为 `medium` / `high`、并且 horizon altitude 与 clearance 都是有效数字时，才视为 deterministic clearance。

## Missing Data Policy

缺少目标方位、高度、机位海拔或方向剖面时：

- `obstructionLevel = "unknown"`
- `confidence = "low"` 或 `"unknown"`
- `horizonAltitudeDegrees = null`
- `obstructionClearanceDegrees = null`
- `dataSource = "qualitative_fallback"`

可显示定性提示，例如山顶、山谷、湖边或开阔地的现场复核建议，但不能推断为无遮挡，也不能把缺失值显示成 `0°`。

## Astro Integration

星空 / 银河链路使用 `resolveMilkyWayTerrainHorizonAssessment`：

- 将银河候选窗的银心方位角 / 高度角作为目标几何。
- 优先使用 `horizonProfile.directionSamples`。
- 兼容旧字段 `milkyWayHorizonAngle`，但只作为带来源标记的方向样本，不作为缺失数据的替代。
- confirmed `obstructed` 会压低银河几何分和可拍判断；`marginal` 轻度降级；低置信度或 unknown 不加精确扣分，只提示现场复核。
- 严重云量、能见度、降水等天气阻断仍优先作为主 blocker。

## UI Contract

Astro 结果页显示三层信息：

- 主决策卡：遮挡状态、简短原因、行动建议。
- 每晚卡片：紧凑显示 `地形遮挡：无遮挡 / 临界 / 可能遮挡 / 数据不足`。
- 专业数据：折叠默认关闭，展开后显示目标方位、目标高度、地形地平线、clearance、来源、置信度、样本数量和规则。

正常公开页面不展示 provider code、原始 DEM 细节或内部调试字段。

## Local DEM Integration

- Astro-service can read a local EPSG:4326 GeoTIFF/COG from `/app/data/terrain-dem/current/terrain-dem.cog.tif` with metadata from `/app/data/terrain-dem/current/metadata.json`.
- `POST /terrain-dem/profile` samples outward from the WGS84 observer along the target azimuth, computes the maximum apparent terrain angle, and returns `clearance = target altitude - terrain horizon altitude`.
- DEM absence, metadata absence, unreadable raster, out-of-bounds coordinates, nodata pixels, missing target geometry, and insufficient samples all return unavailable states. They do not become clear terrain.
- The API maps available DEM profiles to `TerrainHorizonDirectionSample` with `dataSource="dem_raster"` and lets the existing helper decide deterministic clearance. Scoring remains conservative: only medium/high confidence profiles can create a deterministic terrain penalty.

## Tests

覆盖点：

- helper 阈值分类：clear / marginal / obstructed。
- 缺少方向剖面时保持 unknown，不伪造精确角度，不触发网络调用。
- 低置信度方向样本不作为 deterministic clearance。
- Astro scoring：confirmed obstruction 保守降分，低置信度不精确扣分，天气严重时仍是主阻断。
- Astro UI：主卡、每晚卡片、折叠专业数据和缺失状态文案。
