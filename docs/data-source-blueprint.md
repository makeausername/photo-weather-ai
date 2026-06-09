# 数据源蓝图

本文定义逐光天气按模块选择数据源的策略。原则是：免费、开放、本地数据准确够用时优先使用；付费 API 只在明显提升准确率、可靠性或覆盖范围时使用，并且必须有配额、缓存、日志和人工启用控制。

## 总体原则

- 本地开发和自动化测试默认使用 mock / fixture / local deterministic 数据。
- 不在本任务中实现真实外部 API 调用。
- 不把真实 API Key 写入仓库或文档。
- 付费接口必须通过后台配置、显式启用和成本记录控制。
- 同一地点、同一时间窗口、同一 provider 的结果必须优先复用缓存。
- AI 只解释确定性事实，不生成天气、天文、地形或坐标事实。

## Location and Spot Module / Amap

- required data：国内地点搜索、地理编码、逆地理编码、POI 名称、行政区、GCJ-02 坐标。
- preferred source：Amap / 高德 Web Service，配合本地地点和摄影机位数据库。
- free/open/local option：本地 verified spot 数据库、mock geo provider、人工录入地点。
- paid option if needed：Amap 付费配额或更高并发服务。
- development mode：允许真实开发测试，但必须由后台 provider config 显式启用并配置 key；自动化测试必须 mock。
- production mode：优先本地机位命中；未命中时调用 Amap；结果缓存并记录用量。
- cost risk：热门搜索和模糊输入可能造成重复调用。
- accuracy risk：Amap 返回 GCJ-02，不可直接用于天文、地形和评分计算。
- fallback strategy：本地地点库、最近已缓存搜索结果、手动输入经纬度、提示用户选择已验证机位。

特别约束：

- Amap 用于中国地点搜索、geocoding 和 reverse geocoding。
- key 配置在后台 provider settings 中，`.env.local` 只能作为本地开发兜底。
- Amap 坐标不直接用于天文计算；必须将 GCJ-02 明确转换为 WGS84，并在结果中保留两个坐标系。

## AI Explanation Module / DeepSeek

- required data：确定性评分结果、关键依据、风险列表、最佳窗口、备选计划、用户题材目标。
- preferred source：DeepSeek explanation only。
- free/open/local option：规则解释、模板摘要、无 AI 解释。
- paid option if needed：DeepSeek API，固定使用 `deepseek-v4-pro` 高质量解读模型。
- development mode：允许真实开发测试，但必须后台启用 provider、启用真实调用并配置 key；自动化测试必须 mock 或 rule-only。
- production mode：默认手动触发生成，后续可按付费权益开放自动生成。
- cost risk：每次 forecast 自动生成解释会快速增加成本。
- accuracy risk：模型可能补全不存在的天气事实或过度承诺。
- fallback strategy：规则解释、显示确定性评分和原始依据、禁用 AI 段落。

特别约束：

- DeepSeek 只用于解释和决策文案。
- 永远不得发明天气、天文、地形、坐标、评分或数据源事实。
- AI 输出必须能被确定性输入约束；缺失字段必须如实说明。

## Weather Module / QWeather

- required data：实时天气、小时预报、日预报、天气预警、空气质量、基础气象字段。
- preferred source：中国主天气 provider。
- free/open/local option：本地 fixture、mock weather provider、公开样例数据。
- paid option if needed：QWeather 商业 API。
- development mode：本地和自动化测试不调用真实 QWeather；真实测试放到 server/staging，除非任务明确允许并已后台启用。
- production mode：按地点、预报窗口和生成时间桶缓存；面向热门机位做受控预取。
- cost risk：热门机位、多人查询和多窗口重复请求会增加调用量。
- accuracy risk：部分套餐可能缺少低中高云、能见度、露点等摄影关键字段。
- fallback strategy：Open-Meteo 补充字段、缓存降级、显示缺失字段并降低置信度。

## Weather Module / Open-Meteo

- required data：云层、能见度、露点、气压、风、降水、温湿度、多模型辅助字段。
- preferred source：免费/open endpoint where allowed；后续按商业条款使用 customer endpoint。
- free/open/local option：fixture、mock、公开免费端点在许可范围内使用。
- paid option if needed：Open-Meteo commercial/customer endpoint。
- development mode：本地测试使用 fixture/mock，不调用真实 forecast API。
- production mode：作为 QWeather 的字段补充、冲突检测或海外/特殊区域备用数据源。
- cost risk：商业端点和高频多模型调用可能产生费用。
- accuracy risk：部分区域和山地微气候与实际机位偏差较大。
- fallback strategy：QWeather、缓存、历史校准、缺失字段降级。

## Astronomy Module

- required data：日出日落、晨昏光、月相、月亮照明、月出月落、月亮高度、无月夜、银河窗口、银心方向/高度。
- preferred source：本地 deterministic calculation。
- free/open/local option：当前本地 astronomy engine；后续可用 Python Skyfield/Astropy service 提升精度。
- paid option if needed：默认不使用在线 astronomy API；只有在特殊天象数据明显提升产品价值时再评估。
- development mode：本地计算，ephemeris files cached or bundled，不联网。
- production mode：服务端本地计算，版本化星历文件，记录计算库版本。
- cost risk：主要是计算资源和星历文件维护成本，不是 API 成本。
- accuracy risk：简化模型可能影响银心高度、月出月落和地平线附近结果。
- fallback strategy：标注估算等级，提示结合地形遮挡、月光和光污染，必要时隐藏低置信窗口。

## Terrain / Elevation Module

- required data：机位海拔、周边谷地海拔、高差、坡向、地平线遮挡、日出日落遮挡、银河方向遮挡、云海地形潜力。
- preferred source：本地 verified spot metadata + local cached DEM。
- free/open/local option：mock/local 数据、SRTM、Copernicus DEM、本地缓存 DEM、人工核验机位。
- paid option if needed：Open-Meteo Elevation 或其他商业 DEM/地形服务。
- development mode：initial mock/local，不调用真实 DEM / elevation API。
- production mode：优先本地缓存 DEM；热门机位预计算地形剖面和遮挡结果。
- cost risk：按请求调用 elevation API 会在热门机位上重复消耗。
- accuracy risk：DEM 分辨率不足、机位坐标偏移、山体遮挡和道路可达性变化。
- fallback strategy：使用已验证机位海拔、周边样本点估算、人工标注遮挡、置信度降级。

## Light Pollution Module

- required data：卫星夜光栅格辐亮度、相对环境光害、城市方向光害、数据年份和分辨率。
- preferred source：合法取得的公开 VIIRS-compatible / light pollution atlas 类 GeoTIFF，本地缓存。
- free/open/local option：公共栅格数据、离线瓦片、预处理 spot 卫星夜光参考。
- paid option if needed：只有当商业 API 明显提升覆盖、更新频率或解析度时才评估。
- development mode：mock/local spot metadata。
- production mode：本地缓存查询；热门机位可预计算卫星夜光参考等级。
- cost risk：逐请求在线查询不适合星空/银河热门场景。
- accuracy risk：光污染数据更新慢，临时灯光、天气散射和城市发展会造成偏差。
- fallback strategy：显示数据年份，允许用户反馈校准，缺失时降低星空/银河置信度。

## Photography Scoring Module

- required data：归一化天气、天文、地形、光污染、机位元数据、缺失字段和 provider 状态。
- preferred source：各 deterministic provider 的 normalized output。
- free/open/local option：mock forecast、local astronomy、mock terrain、local spot metadata。
- paid option if needed：仅间接来自天气、地形或光污染 provider。
- development mode：固定 mock/fixture，便于回归测试。
- production mode：使用缓存后的 provider 数据并保留 source metadata。
- cost risk：评分本身不应产生付费调用。
- accuracy risk：输入缺失或冲突会导致结论不稳定。
- fallback strategy：置信度降级、显示缺失字段、提供保守建议和备选计划。

## User Center Module

- required data：查询历史、收藏机位、已保存报告、额度、付费计划状态、用户反馈、报告生成来源和使用量。
- preferred source：自托管数据库、后台运营配置、provider usage logs、用户主动反馈。
- free/open/local option：本地数据库、mock billing、空状态、手动导入反馈。
- paid option if needed：后续支付 provider、短信 provider、对象存储 provider；只有进入商业化阶段才启用。
- development mode：占位、mock quota、mock billing，不调用真实支付、短信或存储服务。
- production mode：按用户、套餐、provider 和报告保存行为记录额度和成本；保存报告必须关联数据源快照。
- cost risk：不受控保存报告、AI 自动生成和付费 provider 查询会放大成本。
- accuracy risk：用户反馈可能主观、样本稀疏或缺少原始拍摄条件。
- fallback strategy：保留本地报告摘要、显示未开通状态、允许用户手动补充反馈，付费 provider 不可用时不阻断基础查询。

## Weather paid API cost rules

- 缓存热门机位结果。
- 去重同一地点、同一时间窗口、同一 provider 的重复请求。
- 避免对同一 forecast window 反复调用 provider。
- 后续区分免费用户和付费用户。
- 记录 API usage cost。
- provider 调用必须能按后台开关、配额和速率限制暂停。
- 免费/open/local 数据够准确的模块优先不使用付费 API。
