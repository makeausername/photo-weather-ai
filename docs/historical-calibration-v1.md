# Historical Calibration V1

Historical Calibration V1 closes the General Forecast decision loop with historical replay, manual outcome labels, and conservative calibration hints. It is not machine learning yet: every replay still uses the current deterministic weather, terrain, astronomy, and scoring rules.

## 数据流

1. 后台选择机位、目标和日期范围。
2. Historical Weather Provider 拉取或导入小时级历史天气。
3. 系统把历史天气归一化为和实时预报一致的字段语义。
4. Replay Service 用当前 deterministic scoring path 重新计算历史日期的推荐、分数、窗口和风险。
5. 管理员在后台录入真实观测结果。
6. Calibration Stats 对比预测和观测，生成命中率、误报率、漏报率和错配原因。
7. General Forecast 在样本量足够时读取保守提示，只调整置信表达，不自动改写规则。

## 数据模型

新增表：

- `historical_weather_samples`：按机位/位置、小时、来源存储归一化历史天气，包含温度、湿度、露点、风、降水、云量分层、能见度、气压、天气代码和服务端 raw JSON。
- `forecast_replay_runs`：一次历史回放批次，记录位置、日期范围、目标、模型版本、规则版本、来源和执行状态。
- `forecast_replay_results`：每个历史日期的 deterministic replay 输出，保存综合分、推荐标签、最佳窗口、云海/白墙/霞光/星空关键分项和预测 JSON。
- `observed_outcomes`：后台或导入的真实结果标签，支持成功、部分成功、失败、未知，以及云海、白墙、霞光、星空、通透度、降雨影响等人工标签。
- `calibration_stats`：按位置、目标、规则版本聚合样本数、命中率、误报率、漏报率、窗口命中率和中文错配建议。

所有表都使用 `locationKey` 作为跨本地机位、外部地点和自定义 WGS84 坐标的统一校准键。

## 历史天气

V1 默认 provider 是 Open-Meteo Historical Weather API。它不需要 API key，适合作为开发和基础校准来源。官方文档说明 archive endpoint 使用 `/v1/archive`，按坐标、日期范围和 `hourly` 变量返回历史数据，并列出温度、相对湿度、露点、降水、雨、雪、云量分层、风、阵风、风向、海平面气压和天气代码等小时变量。

当前默认请求字段：

- `temperature_2m`
- `relative_humidity_2m`
- `dew_point_2m`
- `precipitation`
- `rain`
- `snowfall`
- `cloud_cover`
- `cloud_cover_low`
- `cloud_cover_mid`
- `cloud_cover_high`
- `wind_speed_10m`
- `wind_gusts_10m`
- `wind_direction_10m`
- `pressure_msl`
- `weather_code`

`visibility` 和 `precipitationProbability` 在数据模型中保留为可选字段。Open-Meteo archive 文档未把它们列为默认历史小时变量，所以 V1 不默认请求这两个字段；如果未来通过其他 provider、导入文件或历史产品提供，归一化层可以直接保存。

Meteoblue historical 只保留接口枚举和来源占位。没有明确配置和权限时，V1 不发起 meteoblue 历史请求。

## 回放规则

`runHistoricalReplay(...)` 会读取已存储的历史小时样本，构造与实时 forecast 一致的 normalized weather bundle，再调用 `buildForecastInputFromNormalizedWeather(...)` 和 `calculateForecast(...)`。

约束：

- 不调用实时 forecast provider。
- 不读取 provider secret。
- 不创建单独的简化评分模型。
- 天文数据使用本地 deterministic astro calculation，坐标只用 WGS84。
- 地形输入走当前 terrain provider seam，便于未来接入真实 DEM。

## 观测标签

后台 `/admin/calibration` 支持：

- 选择机位、目标和日期范围。
- 拉取历史天气。
- 执行历史回放。
- 查看回放结果表。
- 为日期录入真实结果：成功、部分成功、失败、未知。
- 录入云海、白墙、朝霞、晚霞、星空可见度、通透度、降雨影响、备注和证据 URL。

后台显示详细统计；普通用户页只在样本量足够时显示一句保守历史校准提示。

## 命中率计算

每条 `ForecastReplayResult` 和同日 `ObservedOutcome` 对齐后分类：

- 推荐或谨慎前往 + 成功：`true_positive`
- 推荐或谨慎前往 + 部分成功：`partial_match`
- 推荐专程前往或谨慎前往 + 失败：`false_positive`
- 不建议 + 失败：`true_negative`
- 不建议 + 成功：`false_negative`
- 未标注或未知：`unlabeled`

V1 hit rate = `(TP + TN + 0.5 * partial_match) / labeled_sample_count`。

误报率 = `false_positive / labeled_sample_count`。

漏报率 = `false_negative / labeled_sample_count`。

样本量低于 10 时不对普通用户展示校准提示。

## 普通 forecast 提示

General Forecast 只读取保守 `CalibrationHint`：

- 样本数足够时显示：`历史校准：该机位同类条件命中率约 xx%，建议谨慎参考。`
- 误报偏高时降低提示 tone，并提醒本次谨慎参考。
- 漏报偏高时提示附近可保留现场观察。
- 不展示 raw JSON、provider 细节、完整统计表或调试字段。

这一步不会自动重写评分阈值，避免少量样本过拟合。

## 服务器命令

部署或更新：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm build
```

生产服务器 smoke test：

```bash
PHOTO_WEATHER_ADMIN_ACCESS_TOKEN=... corepack pnpm calibration:test
```

可选参数：

```bash
CALIBRATION_SPOT_ID=spot-guangmingding
CALIBRATION_START_DATE=2026-05-01
CALIBRATION_END_DATE=2026-05-07
CALIBRATION_TARGETS="general cloud_sea glow astro"
PHOTO_WEATHER_API_BASE_URL=http://127.0.0.1:4000
```

脚本会打印 samples inserted、replay results count、预测推荐和已有标签下的校准统计。它不会打印 API key、token 或 provider secret。
