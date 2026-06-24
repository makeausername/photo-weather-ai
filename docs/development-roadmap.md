# 开发路线图

本文定义逐光天气的分阶段路线。阶段实现可以递进，但最终产品范围不能缩窄：逐光天气必须覆盖或超过天文通、莉景天气类工具的核心信息类别，并提供更细、更透明、更面向摄影出行决策的支持。

## Stage 1: Product shell and contracts

目标：建立产品壳、核心流程和确定性数据契约。

范围：

- Product shell。
- location / spot。
- mock forecast。
- target-aware result pages。
- calendar / astro / terrain / weather contracts。
- 简体中文默认文案。
- 数据源诚实提示。
- GCJ-02 展示坐标和 WGS84 计算坐标并存。

不做：

- 不接入真实天气生产判断。
- 不接入真实付费天气 API。
- 不实现支付和套餐。

## Stage 2: Deterministic calculation core

目标：提高本地确定性能力，为真实 provider 接入做准备。

范围：

- accurate local astronomy service。
- calendar core。
- terrain core。
- weather provider normalization。
- 缺失字段记录。
- 初步置信度输入。
- 本地 fixture 和 mock 回归测试。

不做：

- 不让文案摘要或展示层计算天气、天文、地形或评分事实。
- 不绕过 provider normalization 直接读取原始 provider JSON 做评分。

## Stage 3: Controlled real-provider development

目标：在受控环境中验证真实 provider 的字段质量、成本和失败模式。

范围：

- server/staging QWeather/Open-Meteo tests。
- caching and usage logs。
- provider failure handling。
- admin provider config。
- 真实调用显式启用和 key 管理。

边界：

- 本地自动化测试仍然 mock / fixture。
- QWeather / Open-Meteo 真实 forecast 测试默认放在 server/staging。

## Stage 4: Real forecast decision pipeline

目标：让逐光天气从演示数据进入可控真实预报判断。

范围：

- real forecast pipeline。
- result confidence。
- provider conflict display。
- data-source transparency。
- 缓存命中、失败降级和缺失字段展示。
- 云海、白墙、霞光、星空、银河、透明度和综合出行价值的真实数据输入。

质量要求：

- 结果页显示 provider、更新时间、预报窗口、缺失字段和置信度。
- 数据冲突时显示冲突，而不是给出过度确定的结论。

## Stage 5: User center

目标：让用户能保存、复盘和管理自己的摄影决策。

范围：

- user center。
- query history。
- favorite spots。
- saved reports。
- quotas。
- 用户反馈入口。
- 机位收藏和报告复盘。

不做：

- 不在缺少成本控制和使用日志时开放无限制付费 API 调用。

## Stage 6: Commercialization and operations

目标：让产品具备可运营、可控成本和可部署能力。

范围：

- paid plans。
- reporting。
- API cost control。
- production deployment。
- admin cost dashboard。
- per-user quota。
- provider health monitoring。
- 缓存策略和热门机位预取策略。

边界：

- 付费 API 只用于实际提升准确性、可靠性或覆盖范围的模块。
- 套餐权益不能掩盖数据源缺失和置信度下降。

## Stage 7: Calibration and backtesting

目标：把产品从“规则判断”推进到“持续校准的摄影决策系统”。

范围：

- historical backtesting。
- user feedback calibration。
- spot-specific accuracy tuning。
- 热门机位阈值调整。
- 云海、白墙、霞光、银河命中率复盘。
- provider 质量比较。
- 光污染和地形人工修正。

输出：

- 不同题材的命中率报告。
- 不同 provider 的字段质量和冲突统计。
- 不同机位的校准参数和人工核验状态。

## Codex guidance

Future Codex tasks must not narrow the product scope.

If a task touches weather, astronomy, terrain, scoring, provider normalization, result pages, data-source display, or user decision copy, it must preserve this boundary:

逐光天气 should eventually cover at least Tianwentong + Lijing Weather style information and provide more detailed photography decision support.

Operational rules for future Codex work:

- Read `DESIGN.md` before public UI or product architecture changes.
- Keep deterministic facts out of generated copy and display-only helpers.
- Keep real provider calls opt-in and controlled by admin/provider configuration.
- Preserve GCJ-02 for display and WGS84 for weather/astronomy/terrain/scoring calculations.
- Prefer mock, fixture, local deterministic, cached, or open data before paid API calls.
- Do not introduce schema, UI, scoring, or provider behavior changes when the task is documentation-only.
