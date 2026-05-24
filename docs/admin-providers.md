# 后台服务商配置

`/admin/providers` 是生产服务商配置控制台。API Key 只保存在服务端数据库的 `secretJson` 中，前端只接收 `maskedSecretJson`，测试连接响应也不会返回原始密钥。

## 保存配置与测试连接

- **保存配置**：只保存启用状态、优先级、非密钥配置和新填写的密钥，不会自动请求第三方服务。
- **测试连接**：只有服务商已启用、`启用真实调用` 已打开，并且必要凭据已保存时，才会由管理员点击后请求真实服务。
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

meteoblue Free Weather API 可用于 Forecast API 测试。默认配置：

- Base URL：`https://my.meteoblue.com`
- Packages：`basic-1h,clouds-1h`

启用真实调用且 API Key 已保存后，后台测试连接会请求黄山光明顶坐标的 Forecast API package URL。当前任务只启用后台“测试连接”，不会把 meteoblue 自动加入 forecast 计算流程，除非天气融合后续显式接入。

## 高德地图

保存高德 Web 服务 Key 后，启用服务商和真实调用，再点击测试连接。后台会使用轻量地点搜索验证高德服务，响应只显示地点摘要，不返回 Key。

## DeepSeek

DeepSeek 只用于解释确定性评分、风险和拍摄建议。启用服务商和真实调用并保存 API Key 后，测试连接会执行最小 JSON 响应检查。DeepSeek 不计算天气、天文、地形、坐标或评分。

## 服务器诊断

生产服务器可运行：

```bash
bash scripts/test-providers.sh
```

脚本会使用 `.env.production` 和 `docker compose --env-file .env.production -f docker-compose.prod.yml` 调用后台测试端点，输出安全状态，不打印 API Key。若管理员登录凭据不可用，以后台 UI 手动测试为准。
