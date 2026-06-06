# 逐光天气本地天文计算服务

`apps/astro-service` 是 `target=astro` 使用的本地天文计算服务。它使用 Skyfield 和本地 JPL 星历文件计算日出日落、晨昏、月相、月出月落、月亮高度、天文黑夜、无月黑夜、银心高度方位和推荐银河窗口。

运行时不调用在线天文 API。缺少星历文件时，`POST /astro/calculate` 会返回明确错误，不会使用伪造结果。

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

星历会缓存到 `apps/astro-service/data/de421.bsp`。该文件较大，不提交到仓库。生产部署使用 `bash scripts/download-ephemeris.sh` 下载并写入 Docker 持久化卷 `/app/data/de421.bsp`；如服务器无法访问默认 JPL/NAIF 来源，可设置 `EPHEMERIS_URL` 指向可访问的 `de421.bsp` 镜像后重试。

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
