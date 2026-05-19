# Photo Weather AI

逐光天气是面向中国大陆风光摄影用户的天气与拍摄机会判断系统，公开标语为“风光摄影出行判断工具”。当前仓库处于自托管 SaaS 产品基础与界面打磨阶段，重点是数据库、后台配置、地点/机位资料、亮色默认主题和前端 UI 基线。

当前步骤是 forecast 本地模拟计算核心 V1：可见产品品牌使用“逐光天气”，公开首页搜索框已接入地点识别与机位匹配，并可以选择预报范围、分析目标后进入 `/forecast` 模拟计算结果页；内部仓库名、包名和 scope 仍保持 `photo-weather-ai` / `@photo-weather/*`，不做代码仓库或包作用域重命名。

## 当前状态

已实现：

- 中文优先的 Next.js 前端 UI 基线。
- Tailwind CSS 全局样式、CSS 变量设计 token、亮色默认主题、可选深色主题和适合中文界面的字体栈。
- 公开产品导航 shell：逐光天气品牌、SVG 品牌图标、风光摄影出行判断工具标语、首页 / 云海 / 朝霞晚霞 / 星空银河 / 机位库 / 定价导航、主题切换、登录入口和开始分析入口。
- 公开首页：输入目的地、快速地点、功能卡片和静态决策卡预览已接入统一产品导航。
- 公开占位模块：`/cloud-sea`、`/glow`、`/astro`、`/spots`、`/pricing` 和 `/login` 使用统一公开导航与中文产品化占位页。
- 公开地点搜索：`GET /search/places?q=` 会先查本地地点和摄影机位，再使用当前 GeoProvider 返回标准化地点结果。
- 公开搜索选择态：选择地点后展示地点名称、地址 / 城市信息、数据来源、GCJ-02 / WGS84 经纬度、验证状态和本地机位匹配状态。
- 公开 forecast 查询基础：支持选择预报范围和分析目标，下一步跳转 `/forecast`，URL 中显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、预报范围、分析目标以及可用的本地地点 / 机位 ID。
- Forecast 计算核心 V1：已定义标准化小时天气、日天气、地形摘要、天文摘要、计算输入和计算结果契约，`packages/scoring` 提供本地 mock 数据构造器、标准化天气输入 builder 和可解释 rule-based 评分计算器。
- 公开 forecast 端点：`POST /forecast/validate-query` 只校验查询输入并返回中文标签；`POST /forecast/calculate` 默认使用 MockWeatherProvider 的标准化天气数据生成本地模拟计算结果，不调用真实天气、地形、天文或 AI 服务。
- 后台登录页：亮色渐变背景、居中登录卡片、中文表单和样式化错误提示。
- 后台控制台布局：亮色侧栏、顶部标题区、当前管理员信息、主题切换、返回前台、退出登录、内容区域。
- 后台页面视觉层：系统设置、服务商配置、地点管理、机位管理、审计日志使用统一卡片、表格、表单、按钮和空状态。
- 受保护的后台 API、JWT 登录、数据库 RBAC、系统设置、服务商占位配置、地点/机位 CRUD、审计日志基础。

尚未实现：

- 真实天气数据驱动的 forecast / 预测结果、真实服务商接入和生产级决策建议。
- 真实天气服务商调用。
- 真实 DeepSeek 或其他 AI 调用。
- 支付、套餐、额度和商业化流程。
- 生产级 Cookie/Session 加固。
- 公开用户登录、查询历史、收藏机位、额度控制、付费套餐和已保存报告；当前 `/login` 只是公开登录占位页，不包含真实登录逻辑。

当前公开首页的决策卡为静态 mock 内容，只用于展示产品方向，不包含真实预报或真实服务商调用。当前搜索与 forecast 流程已完成地点识别、坐标归一化、机位匹配、预报范围选择、分析目标选择、本地 mock 预报输入构造、摄影评分和 `/forecast` 模拟结果展示；后续真实 provider 接入、公开用户账号和生产判断逻辑尚未实现。

## 产品默认

- 默认语言：`zh-CN`。
- 可见产品品牌：`逐光天气`。
- 公开标语：`风光摄影出行判断工具`。
- 品牌图标：`apps/web/public/brand-mark.svg`，站点图标：`apps/web/public/favicon.svg`。
- 内部仓库和 package scope：继续使用 `photo-weather-ai` / `@photo-weather/*`。
- 默认时区：`Asia/Shanghai`。
- 默认币种：`CNY`。
- 默认地图服务商：Amap / 高德地图。
- 面向用户和管理员的界面文案默认使用简体中文。
- 默认主题：亮色主题。深色主题为可选项，当前通过浏览器 `localStorage` 保存用户偏好。
- 技术 key、provider code、JSON 字段和 API 标识可以保留英文。

坐标系约定：

- 地图展示和地图服务商结果使用 GCJ-02。
- 天气、天文、地形和未来评分计算使用 WGS84。
- 地点和机位记录同时保存 GCJ-02 与 WGS84，避免未来计算混用。

## Forecast 计算核心 V1

当前 `/forecast` 是本地模拟计算结果页，用于展示用户选择的地点、预报范围、分析目标、坐标信息和本地 mock 评分结果。页面会调用 `POST /forecast/calculate`，后端默认使用 `MockWeatherProvider` 输出的标准化天气数据，并运行 deterministic rule-based 评分引擎。当前不会调用真实 QWeather、Open-Meteo、高德地图、DeepSeek、存储、支付或短信服务。

当前计算核心覆盖：

- 云海、白墙风险、朝霞、晚霞、星空、银河和通透度评分。
- 综合出片指数、推荐等级、最佳拍摄窗口、风险提示、关键依据和拍摄建议。
- 黄山光明顶、老君山金顶、三清山女神峰、武功山金顶等本地模拟样例。
- Mock 数据提示：`当前为本地模拟天气数据，计算结果仅用于验证流程，不代表真实预报。`

`packages/weather` 已提供天气服务商契约、ProviderFactory、QWeather / Open-Meteo fixture adapter 和小时/日天气标准化逻辑。QWeather fixture 会把不可用的低云/中云/高云分层置为 `null` 并写入 source notes；Open-Meteo fixture 会映射 `cloud_cover_low`、`cloud_cover_mid`、`cloud_cover_high`、能见度、露点、风速、阵风、降水概率和降水量。

真实准确率仍需要后续接入 QWeather / Open-Meteo 真实预报、地形 DEM、天文数据、云层/能见度校准和历史天气数据回测。历史天气数据会用于后续校准、backtesting 和评分权重验证。真实 QWeather / Open-Meteo / 高德地图 / DeepSeek 集成会在后续 staging / production 服务器环境测试，本地开发和自动化测试仍只使用 mock providers、fixture JSON 与 deterministic test data。

支持的预报范围：

- 未来24小时
- 未来48小时
- 未来72小时
- 未来7天

支持的分析目标：

- 综合判断
- 云海
- 朝霞晚霞
- 星空银河

当前查询契约由 `@photo-weather/shared` 中的 `forecastQueryInputSchema` 维护，前端 URL 会显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、预报范围、分析目标以及可用的本地地点 / 机位 ID。`POST /forecast/calculate` 会先复用该 schema 校验输入，再构造 `ForecastCalculationInput` 并返回 `ForecastCalculationResult`。

公开用户登录、查询历史、收藏机位、额度控制和付费套餐计划在后续阶段实现，不属于当前 forecast 查询基础步骤。当前 `/login` 仅作为公开导航入口和功能说明占位，不接入真实公开账号体系。

## 架构

- `apps/web`：Next.js App Router 前端与后台控制台。
- `apps/api`：Fastify API 服务。
- `apps/worker`：未来任务队列 worker 占位。
- `packages/shared`：共享类型、Zod schema 和标签。
- `packages/config`：环境配置、运行时配置和密钥遮罩。
- `packages/db`：Prisma schema、迁移、seed、系统设置、服务商配置、地点、机位、审计日志。
- `packages/geo`：地理服务接口、deterministic mock 搜索、高德地图 Web 服务 provider 基础、坐标校验与 GCJ-02 / WGS84 转换。
- `packages/weather`：天气服务接口、标准化天气模型、ProviderFactory、MockWeatherProvider，以及 QWeather / Open-Meteo fixture-based normalization adapters。
- `packages/terrain`：地形与海拔服务接口。
- `packages/astro`：天文服务接口。
- `packages/scoring`：本地 forecast mock 数据构造器、摄影评分 helper、朝霞/晚霞/云海/白墙/星空/银河/通透度计算器和综合推荐分类。
- `packages/ai`：AI 服务接口、mock provider、规则兜底和 DeepSeek 骨架。
- `packages/storage`：存储服务接口与 mock 存储。
- `packages/billing`：计费与额度占位类型。

## 本地开发

使用 Corepack 管理 pnpm：

```bash
corepack pnpm install
```

Windows PowerShell 本地开发流程：

1. 先打开 SSH tunnel，确保远程 PostgreSQL 映射到 `127.0.0.1:15432`。
2. 在 `.env.local` 写入本地配置，不要提交 `.env.local`。
3. 检查端口和数据库隧道：

```bash
corepack pnpm check:local
```

4. 启动 API 和前台：

```bash
corepack pnpm dev:local
```

5. 浏览器访问：

- 公开首页：`http://localhost:3000`
- 云海判断：`http://localhost:3000/cloud-sea`
- 朝霞晚霞：`http://localhost:3000/glow`
- 星空银河：`http://localhost:3000/astro`
- 摄影机位库：`http://localhost:3000/spots`
- 定价方案：`http://localhost:3000/pricing`
- 用户登录占位：`http://localhost:3000/login`
- 后台登录：`http://localhost:3000/admin/login`
- 后台控制台：`http://localhost:3000/admin`

停止本地服务：

```bash
corepack pnpm stop:local
```

`dev:local` 会启动：

- API：`http://localhost:4000`
- 前台：`http://localhost:3000`

前台默认读取：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

高德地图 Web 服务 Key 后续优先在后台服务商配置页填写；环境变量仅作为部署兼容入口：

```bash
AMAP_API_KEY=
# 兼容部分部署命名：
AMAP_WEB_SERVICE_KEY=
```

本地自动化测试默认使用 `MockGeoProvider`，不会读取真实高德密钥，也不会调用高德地图网络接口。

如需清理 Next.js 缓存后启动：

```bash
corepack pnpm dev:local -- -Clean
```

常用验证命令：

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 数据库

PostgreSQL 是生产数据库目标。数据库包维护 Prisma schema、迁移、seed data，以及系统设置、服务商、地点、机位、审计日志等 repository helper。

根目录数据库命令：

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm db:studio
corepack pnpm create-admin
```

部署数据库使用 `db:migrate`。一次性本地开发库可以使用 `db:push`。

设置 `DATABASE_URL` 到 `.env.local` 或 `.env`，不要提交本地凭据。例如 Docker Compose 内部连接：

```bash
DATABASE_URL=postgresql://photo_weather:photo_weather@postgres:5432/photo_weather_ai
```

Provider secrets 和永久服务商配置属于数据库后台配置，不应写进业务代码。Seed data 只创建占位服务商和空密钥对象，不包含真实 DeepSeek、QWeather、Open-Meteo、高德地图、存储、短信或支付凭据。

`/admin/providers` 提供可视化服务商配置表单，常用字段包括高德 Web 服务 Key、DeepSeek API Key、和风天气 API Key、Open-Meteo API Key，以及 OSS / COS / S3 的 Access Key、Secret Key、Bucket、Region 和 Endpoint。密钥保存后 API 只返回 `maskedSecretJson`，不会返回原始 `secretJson`；空密钥输入表示保留现有密钥不变，如需删除已保存字段请使用后台表单中的清除操作。

Seed data 包含未核验的中国风光摄影示例地点与机位：

- 黄山 / 黄山光明顶
- 老君山 / 老君山金顶
- 三清山 / 三清山女神峰
- 武功山 / 武功山金顶

这些坐标、海拔、交通、安全和风险信息仅为示例，生产使用前必须在后台人工核验。

## 首个管理员

先执行数据库迁移和 seed，再创建超级管理员：

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me-to-a-long-random-password ADMIN_DISPLAY_NAME="超级管理员" corepack pnpm create-admin
```

脚本读取：

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `ADMIN_RESET_PASSWORD`

密码会先 bcrypt 哈希再写入数据库，不会明文打印。上线前设置至少 32 字符的强 `JWT_SECRET`。

## 后台 API

认证接口：

```bash
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

配置与资料接口：

```bash
GET   /search/places?q=
POST  /forecast/validate-query
POST  /forecast/calculate

GET   /admin/settings
GET   /admin/settings/:key
PATCH /admin/settings/:key
GET   /admin/settings/groups

GET   /admin/providers
GET   /admin/providers/:providerType/:providerCode
PATCH /admin/providers/:providerType/:providerCode
POST  /admin/providers/:providerType/:providerCode/test-connection

GET    /admin/locations
GET    /admin/locations/:id
POST   /admin/locations
PATCH  /admin/locations/:id
DELETE /admin/locations/:id

GET    /admin/photo-spots
GET    /admin/photo-spots/:id
POST   /admin/photo-spots
PATCH  /admin/photo-spots/:id
DELETE /admin/photo-spots/:id

GET   /admin/geo/search?q=
GET   /admin/audit-logs
```

后台 API 使用 JWT 和数据库 RBAC：

- 系统设置：`settings.manage`
- 服务商配置：`providers.manage`
- 地点和 mock 地理搜索：`locations.manage`
- 机位：`photo_spots.manage`
- 审计日志：`audit.read`
- `/admin` 状态：`admin.manage`

服务商测试连接和后台地理搜索在当前阶段为本地 mock，不调用真实外部服务。
后台“测试连接”按钮会向 `/admin/providers/:providerType/:providerCode/test-connection` 发送 `{}`，默认返回 `mode: "mock"` 和“当前为本地模拟测试，未触发真实外部连接。”；自动化测试不启用真实服务商联调。接口响应和日志不得暴露原始密钥。

## 后台控制台

当前 Next.js 后台路由：

```bash
/admin/login
/admin
/admin/settings
/admin/providers
/admin/providers/ai
/admin/providers/weather
/admin/providers/geo
/admin/providers/storage
/admin/locations
/admin/photo-spots
/admin/audit
/forecast
```

后台控制台已具备统一 SaaS 风格布局。公开导航中“管理后台”只保留为次要入口，不作为主要公开转化按钮：

- 左侧导航：控制台、系统设置、服务商配置、地点管理、机位管理、审计日志。
- 顶部标题区：当前页面标题、描述、当前管理员名称、主题切换、返回前台、退出。
- 内容区：卡片、表格、表单、空状态、确认弹窗和统一按钮。
- 移动端：导航横向滚动，表格允许横向滚动，避免常见笔记本宽度溢出。

后台路由会将未登录用户重定向到 `/admin/login`。当前前端仍使用 `localStorage` 存储 token，这是早期骨架实现，正式公开部署前需要改为生产级会话方案。

## 外部服务边界

本阶段不允许自动化测试调用真实外部服务。当前实现只使用 deterministic mock providers、fixture JSON 和配置占位：

- 不调用真实 QWeather；只允许读取本地 QWeather fixture JSON。
- 不调用真实 Open-Meteo；只允许读取本地 Open-Meteo fixture JSON。
- 自动化测试不调用高德地图真实接口。
- 不调用 DeepSeek。
- 不调用真实存储、短信、支付或计费服务。

本地和测试默认天气服务商为 `mock`。如需验证服务商 adapter，只能显式设置 `WEATHER_PROVIDER=qweather|open_meteo` 且 `WEATHER_PROVIDER_MODE=fixture`；`WEATHER_PROVIDER_MODE=real` 当前会 fail closed，不会悄悄发起网络请求。真实服务商联调应在后续阶段通过后台配置或环境旗标显式启用，并且只在 staging 或 production 环境按操作员意图执行。

高德地图 provider 当前只负责地点搜索、地理编码、逆地理编码和坐标归一化基础。地图展示使用 GCJ-02；天气、天文、地形、DEM 和后续评分计算必须使用 WGS84。真实天气预报请求、真实天气评分校准和 AI 分析不在本步骤实现。

## Docker

`docker-compose.yml` 包含未来 `web`、`api`、`worker`、`postgres`、`redis`、`nginx` 服务骨架。`scripts/` 下脚本是后续一键安装、首个管理员创建和备份流程的基础。
