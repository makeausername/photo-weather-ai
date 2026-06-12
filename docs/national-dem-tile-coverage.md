# National DEM Tile Coverage Manager V1

逐光天气需要全国尺度 DEM 覆盖，原因不是为了显示“海拔数字”，而是为了让云海、银河地平线、日出日落遮挡、山地低温和专业诊断在全国机位上都有同一套可复核的地形基础。少量人工下载的试点 DEM 可以验证算法，但不能支撑全国产品覆盖。

## Safety Rules

- 前端 forecast/API 普通请求不得自动下载 DEM。
- 缺少 DEM 不等于地形无遮挡；系统必须显示地形数据不足，并保持遮挡/云海地形判断为低置信度或未知。
- DEM 栅格文件、生成的下载计划和临时导入产物不提交到 Git。
- 下载只发生在服务器/operator 手动执行的 reviewed command list 中，落地到 `deploy/terrain-dem/incoming/`。
- 激活 DEM 只能通过 `scripts/import-terrain-dem.sh`，导入失败不得覆盖 `current/` 中的现有可用数据。

## Tile Model

Coverage manager 按 Copernicus 1-degree COG tile 管理瓦片。每个瓦片报告：

- `tileId`
- `sourceName`
- `datasetName`
- `datasetVersion`
- `datasetYear`
- `minLatitude` / `maxLatitude`
- `minLongitude` / `maxLongitude`
- `localPath`
- `fileExists`
- `metadataExists`
- `checksum`
- `importedAt`
- `status`: `available` / `missing` / `invalid` / `pending`
- `resolutionMeters`
- `verticalUnit`
- `notes`

默认规划 `copernicus-dem-glo-90`，也支持 `copernicus-dem-glo-30`。Copernicus COG tile ID 示例：

```text
Copernicus_DSM_COG_30_N30_00_E118_00_DEM
Copernicus_DSM_COG_30_N33_00_E111_00_DEM
```

`30` 是 arc-second resolution code，对应 GLO-90；GLO-30 使用 `10`。

## Check Coverage For A Coordinate

容器方式：

```bash
bash scripts/plan-terrain-dem-tiles.sh --coordinate 30.1328,118.171 --json
```

本地 astro-service 目录方式：

```bash
cd apps/astro-service
python -m scripts.plan_terrain_dem_tiles --data-dir ../../deploy/terrain-dem --coordinate 30.1328,118.171 --json
```

运行时只查状态：

```bash
curl 'http://127.0.0.1:4100/terrain-dem/coverage?latitudeWgs84=30.1328&longitudeWgs84=118.171'
```

## Plan Tiles For A Region

中心点 + 半径：

```bash
bash scripts/plan-terrain-dem-tiles.sh --center 30.1328,118.171 --radius-km 80 --json
```

Bounding box：

```bash
bash scripts/plan-terrain-dem-tiles.sh --bbox 29.5,117.5,30.8,119.0 --json
```

坐标列表：

```bash
bash scripts/plan-terrain-dem-tiles.sh \
  --coordinate 30.1328,118.171 \
  --coordinate 28.9139,118.0699 \
  --coordinate 33.7852,111.6402 \
  --json
```

命名区域配置：

```bash
bash scripts/plan-terrain-dem-tiles.sh --region huangshan-sanqingshan-laojunshan-pilot --json
```

区域配置位于 `deploy/terrain-dem/regions/`，只允许包含 `bbox` 或 `coordinates`，不得包含栅格文件、下载命令或生产硬编码逻辑。

## Generate Reviewed Download Commands

只生成命令，不执行下载：

```bash
bash scripts/plan-terrain-dem-tiles.sh \
  --region east-china-mountain-pilot \
  --write-download-script deploy/terrain-dem/incoming/east-china-download-plan.sh
```

或只打印 command list：

```bash
bash scripts/plan-terrain-dem-tiles.sh --region east-china-mountain-pilot --commands
```

生成的命令使用 `curl -fL --retry 5 -C -`，支持 retry 和 resume，目标目录是 `deploy/terrain-dem/incoming/<tileId>/`。review 后由 operator 手动执行。`--download` 当前会报错，避免任何默认自动下载路径。

## Import And Activate Local DEM

下载并复核瓦片后，仍需独立导入激活：

```bash
bash scripts/import-terrain-dem.sh incoming/<tile-directory-or-directory-list> -- \
  --dataset-name "Copernicus DEM local mosaic" \
  --source-name "Copernicus DEM reviewed tiles" \
  --dataset-year 2021 \
  --dataset-version "GLO-90-2021"
```

导入器会验证 GeoTIFF/COG、重投影到 EPSG:4326、写入 COG、生成 checksum/metadata，并在激活前备份旧数据集。失败时不会删除上一版可用 DEM。

检查当前激活数据集：

```bash
bash scripts/check-terrain-dem.sh
```

## GLO-90 vs GLO-30

- GLO-90：文件更小，更适合作为全国覆盖第一阶段；对大尺度山体/地平线判断可用，但近景遮挡和细碎山脊仍需现场复核。
- GLO-30 Public：分辨率更高，磁盘和导入成本更高；适合热门摄影区、复杂山地和高价值机位补强。
- 两者都是 DSM，不是现场实测地形；植被、建筑、坐标偏移和局部遮挡仍可能影响实拍。

## Disk Space Warning

全国范围一次性 GLO-30 会带来很高磁盘、下载和导入成本。建议按“省份/摄影带/热门机位”分批规划，先用 GLO-90 建立全国可用覆盖，再对重点区域追加 GLO-30。

## Staged Rollout

1. Pilot：保留已人工验证的试点 DEM，使用 planner 验证 tile ID 和覆盖诊断。
2. Regional：按华东山地、西部星空等 region config 生成 reviewed command list。
3. Provincial：按省/大区拆分计划，导入后用 `/terrain-dem/coverage` 和 `/terrain-dem/profile` 抽查。
4. National baseline：用 GLO-90 建立全国基础 coverage bounds。
5. Hotspot upgrade：对高价值机位补充 GLO-30，重新导入/激活并记录版本。

## UI Diagnostics

当坐标不在激活 DEM 覆盖范围内：

- public UI 显示 `地形数据不足`。
- 专业数据可显示 `DEM coverage missing` 和 required tile ID。
- public UI 不显示下载命令。
- 系统不把缺失 DEM 当作无遮挡或清晰地形。
