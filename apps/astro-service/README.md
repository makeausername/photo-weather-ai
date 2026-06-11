# 逐光天气本地天文计算服务

`apps/astro-service` 是 `target=astro` 使用的本地天文计算服务。它使用 Skyfield 和本地 JPL 星历文件计算日出日落、晨昏、月相、月出月落、月亮高度、天文黑夜、无月黑夜、银心高度方位和推荐银河窗口。

运行时不调用在线天文 API。缺少星历文件时，`POST /astro/calculate` 会返回明确错误，不会使用伪造结果。

## 本地光污染栅格

光污染 V1 复用本服务，不新增第二个天文服务。生产环境可把合法获取的 VIIRS 兼容夜光 GeoTIFF 放到宿主机：

```text
deploy/light-pollution/incoming/
deploy/light-pollution/current/
```

Compose 将该目录挂载到 `/app/data/light-pollution`。活动数据集使用：

```text
/app/data/light-pollution/current/light-pollution.cog.tif
/app/data/light-pollution/current/metadata.json
/app/data/light-pollution/current/checksum.sha256
```

导入命令：

```bash
bash scripts/import-light-pollution.sh incoming/<file-or-directory> -- --dataset-year 2025 --dataset-version v2.2
```

检查命令：

```bash
bash scripts/check-light-pollution.sh
```

导入器会校验 GeoTIFF 可读性、CRS、尺寸、band、nodata、坐标范围和有限辐亮度值；需要时重投影到 EPSG:4326，输出 tiled/compressed COG，生成 checksum、有效像元统计和 log-radiance quantiles，并在激活前备份上一版。失败导入不会删除上一版有效数据。

运行时查询不会调用外部光污染 API。服务会懒加载栅格、按 worker 进程复用打开的 dataset、用数据集版本感知的有界缓存，并对中心、本地邻域、5/15/30/60 km 环、八方向和银河目标方位做 geodesic 采样。结果是“卫星夜光参考”和相对风险指数；网页可显示基于环境风险指数的估算波特尔范围，但它不是现场 SQM 实测、不是国标等级，也不代表正式 Bortle 观测认证。

缺少栅格时，`/health` 仍可在星历可用时保持天文服务健康，但会报告 `lightPollutionAvailable=false` 和缺失原因；`/astro/calculate` 会返回光污染不可用说明，不会把缺失数据当作低光污染。

银河评分只复用该接口已经返回的光污染结果。环境光污染和银河方向光害会影响星空/银河适宜度、推荐等级和中文理由；如果本地较暗但银河方向光害偏高，页面会建议避开城市方向构图或换更暗机位。光污染不会覆盖云量、低云、降水、月光或天文黑夜/银河窗口缺失等硬阻断；这些条件不通过时仍不建议专程夜拍。估算波特尔保持范围显示，不输出 SQM、国标等级或单一实测等级。

## 本地 Terrain DEM 栅格

Terrain DEM V1 复用本服务，不新增第二个地形服务。生产环境可把合法获得的 GeoTIFF/COG DEM 放到宿主机：

```text
deploy/terrain-dem/incoming/
deploy/terrain-dem/current/
deploy/terrain-dem/backups/
```

Compose 将该目录挂载到 `/app/data/terrain-dem`。活动数据集使用：

```text
/app/data/terrain-dem/current/terrain-dem.cog.tif
/app/data/terrain-dem/current/metadata.json
/app/data/terrain-dem/current/checksum.sha256
```

导入命令：

```bash
bash scripts/import-terrain-dem.sh incoming/<file-or-directory> -- --dataset-name "Local DEM" --source-name "Operator supplied DEM" --dataset-year 2025 --dataset-version v1
```

检查命令：

```bash
bash scripts/check-terrain-dem.sh
```

导入器只接受本地文件或目录，不下载 DEM。它会校验 GeoTIFF 可读性、CRS、尺寸、nodata、有限海拔像元、坐标范围、metadata 和 checksum；需要时重投影到 EPSG:4326，输出 tiled/compressed GeoTIFF/COG，并在激活前备份上一版。失败导入不会删除上一版有效数据。

运行时 `/health` 会报告 `terrainDemAvailable`、`terrainDemDatasetExists`、`terrainDemMetadataAvailable`、`terrainDemDatasetYear`、`terrainDemDatasetVersion`、`terrainDemChecksumShort`、`terrainDemHealthStatus` 和 `terrainDemLoadError`。缺少 DEM 不会在星历和时区健康时让服务整体失败。

`POST /terrain-dem/profile` 会沿目标方位从 WGS84 机位向外做 geodesic 采样，计算最大视地形角、地形地平线、clearance 和遮挡等级。`/forecast/calculate` 在银河方向可用时会把结果映射成 `dem_raster` 地形地平线样本并复用现有 terrain-horizon 模型。只有 medium/high 置信度样本会形成确定性遮挡扣分；缺失、超出 DEM 范围、nodata、不可读或低置信度时保持不确定，不把缺失数据当作无地形遮挡。

## 安装

```powershell
cd apps/astro-service
python -m pip install -r requirements.txt
```

Windows 默认不提供 IANA 时区数据库，`zoneinfo` 解析 `Asia/Shanghai` 需要 `tzdata`。本服务已将 `tzdata` 加入依赖；依赖变更后请重新运行：

```powershell
python -m pip install -r requirements.txt
```

## 准备星历

服务只从 `EPHEMERIS_PATH` 读取 `de421.bsp`。未设置时默认读取：

```text
/app/data/de421.bsp
```

本地开发可设置到仓库内缓存路径后再启动：

```powershell
cd apps/astro-service
python scripts/fetch_ephemeris.py
$env:EPHEMERIS_PATH = (Resolve-Path .\data\de421.bsp).Path
```

星历会缓存到 `apps/astro-service/data/de421.bsp`。该文件较大，不提交到仓库。生产部署使用 `bash scripts/download-ephemeris.sh` 将星历写入 Docker 持久化卷 `/app/data/de421.bsp`；脚本会优先使用仓库内 `deploy/assets/de421.bsp` 或 `apps/astro-service/data/de421.bsp`，也支持 `EPHEMERIS_LOCAL_FILE=/path/to/de421.bsp`。如服务器无法访问默认来源，可设置逗号或换行分隔的 `EPHEMERIS_URLS`，脚本会按顺序尝试多个镜像，并把官方 JPL/NAIF 地址作为 fallback。

## 启动

```powershell
cd apps/astro-service
python -m uvicorn app.main:app --host 127.0.0.1 --port 4100
```

## 黄山光明顶逻辑校验

```powershell
cd apps/astro-service
python -m pytest
```

测试使用近似黄山光明顶 WGS84 坐标：

- 纬度：`30.1321`
- 经度：`118.1691`
- 海拔：`1800`
- 时区：`Asia/Shanghai`
- 日期：`2026-05-22`

断言只检查逻辑关系，不硬编码第三方天文应用的具体分钟值：月光影响不应把有明显月光且月亮在地平线上的时段标为无月黑夜，推荐银河窗口必须位于天文黑夜内，并且必须尊重月落和月光影响。
