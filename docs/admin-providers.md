# 后台服务商配置

`/admin/providers` 是生产服务商配置控制台。当前控制台按“地图与地理服务”“天气数据源”“智能解读”分组管理高德地图、和风天气、Open-Meteo、meteoblue 和 DeepSeek。

API Key 只保存在服务端数据库的密钥字段中，前端只接收脱敏后的 `maskedSecretJson`。后台页面、测试连接响应、诊断脚本和日志都不应输出原始密钥、原始配置 JSON、Prisma 错误或堆栈。

## 控制台 UX

- 页面顶部显示服务商总数、已启用、真实调用和需要处理四个摘要。
- 每个服务商卡片使用同一结构：状态摘要、能力标签、基础开关、必填配置、密钥配置、高级配置、保存配置和测试连接。
- 高级配置默认收起，主要放 `priority`、`timeoutMs`、`retryCount`、Base URL 等低频字段。
- 普通管理员不需要编辑原始 JSON。

## 保存配置与测试连接

- **保存配置**：只保存启用状态、优先级、非密钥配置和新填写的密钥，不会自动请求第三方服务。成功返回 `{服务商} 配置已保存。`
- **测试连接**：只有服务商已启用、`启用真实调用` 已打开，并且必要凭据已保存时，才会由管理员点击后请求真实服务。成功返回 `{服务商} 连接测试通过，耗时 {latencyMs}ms。`
- 自动化测试必须 mock 网络请求，不调用真实 QWeather、Open-Meteo、meteoblue、高德地图或 DeepSeek。

## 和风天气

配置项：

- `和风天气 API Key`：保存到服务端密钥字段。
- `API Host`：在和风天气控制台复制，例如 `xxxxx.qweatherapi.com`，不需要填写 `https://`。
- `启用该服务商` 与 `启用真实调用` 都开启后，点击测试连接会请求黄山光明顶坐标的 `/v7/weather/now`。

测试连接使用 `X-QW-Api-Key` 请求头，不把 Key 放进 URL，也不会在日志或响应中输出 Key。

## Open-Meteo

Open-Meteo 支持两种模式：

- `免费开发模式`：不需要 API Key，测试连接请求公开 forecast endpoint。
- `商业客户模式`：使用 `https://customer-api.open-meteo.com` 或自定义 Customer Endpoint；启用真实调用时必须填写 API Key。

测试字段包括温度、湿度、露点、总云量、低中高云、能见度、风速、阵风、气压和降水概率。

## meteoblue

meteoblue 可作为专业增强天气源，用于 Forecast API 真实测试和多源融合。启用服务商、启用真实调用且 API Key 已保存后，forecast 计算会尝试拉取配置的 Forecast API packages；meteoblue 失败只会降低置信度并写入来源警告，不会中断结果页。

在 meteoblue 控制台开通 Free Forecast API key 后填写 `meteoblue API Key`。默认配置：

- Base URL：`https://my.meteoblue.com`
- Packages：`basic-1h,clouds-1h`

启用真实调用且 API Key 已保存后，后台测试连接会请求黄山光明顶坐标的 Forecast API package URL。关闭真实调用时，测试连接只返回“当前为模拟测试，未请求 meteoblue 服务。”

## 高德地图

保存高德 Web 服务 Key 后，启用服务商和真实调用，再点击测试连接。后台会使用轻量地点搜索验证高德服务，响应只显示地点摘要，不返回 Key。

## DeepSeek

DeepSeek 只用于解释确定性评分、风险和拍摄建议。启用服务商和真实调用并保存 API Key 后，测试连接会执行最小 JSON 响应检查。DeepSeek 不计算天气、天文、地形、坐标或评分。

## 服务器诊断

生产服务器可运行：

```bash
bash scripts/test-providers.sh
```

脚本会使用 `.env.production` 和 `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api pnpm test-provider --all` 在 api 容器内读取数据库配置，输出安全状态，不需要浏览器登录态，也不打印 API Key。

真实 forecast 结果链路可运行：

```bash
bash scripts/test-real-weather.sh
```

该脚本会请求公开 `/forecast/calculate` 端点，使用黄山光明顶作为固定测试点，输出数据状态、来源摘要、温度、云量、穿衣指南和置信度，不打印 API Key。
