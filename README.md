# Photo Weather AI

逐光天气是面向中国大陆风光摄影用户的天气与拍摄机会判断系统，公开标语为“风光摄影出行判断工具”。当前仓库处于自托管 SaaS 产品基础与界面打磨阶段，重点是数据库、后台配置、地点/机位资料、亮色默认主题和前端 UI 基线。

当前步骤是 Product UI redesign V4：可见产品品牌使用“逐光天气”，公开首页已从居中演示页重构为工具式 forecast 工作台，forecast 结果页和后台控制台也同步到更克制的自然色产品界面。公开端不使用“AI”作为品牌表达；内部仓库名、包名和 scope 仍保持 `photo-weather-ai` / `@photo-weather/*`，不做代码仓库或包作用域重命名。

## 当前状态

已实现：

- 中文优先的 Next.js 前端 UI 基线。
- Product UI redesign V4：产品 UI 已改为工具式天气/摄影判断工作台，而不是居中 marketing demo。
- `DESIGN.md` 定义项目级设计系统；后续 UI 修改应先阅读并遵循该文件。
- 新自然色调色板：核心 token 包括 `#F7F4EC`、`#FFFDF7`、`#ECE7DC`、`#17231F`、`#2F6F5E`、`#D88A20`、`#DDD4C4`。
- Tailwind CSS 全局样式、CSS 变量设计 token、亮色默认主题、可选深色主题和适合中文界面的字体栈。
- 响应式公开产品 shell：全宽 sticky 导航、`clamp(24px, 4vw, 72px)` 内容 gutter、桌面充分利用视口宽度、移动端折叠菜单和统一导航。
- 公开产品导航 shell：逐光天气品牌、SVG 品牌图标、风光摄影出行判断工具标语、首页 / 云海 / 朝霞晚霞 / 星空银河 / 机位库 / 定价导航、主题切换、统一“账户”入口和开始分析入口；顶层公开导航不再展示“管理后台”按钮。
- 公开首页：响应式三栏桌面工作区，左侧地点查询面板、中间大幅 forecast/map 视觉工作区、右侧决策摘要面板；900px 到 1199px 自动变为左查询 + 右侧堆叠，移动端单列无横向溢出。
- 首页下方信息架构：场景能力、热门机位和工作流使用同一页面 gutter 的宽屏响应式网格，不再放进窄居中容器。
- 公开 forecast 结果页：同一产品 shell 下的 dashboard 布局，左侧地点/查询摘要，中间综合指数、时间窗口和分项评分，右侧风险、建议、计算依据和数据状态。
- 公开占位模块：`/cloud-sea`、`/glow`、`/astro`、`/spots` 和 `/pricing` 使用统一公开导航与中文产品化占位页。
- Public User Auth V1：`/login` 支持邮箱密码登录，`/register` 支持邮箱密码注册，`/auth/register` 会创建普通 `user` 角色账户并返回安全用户数据；短信登录计划后续接入。
- Account Center Foundation V1：`/account` 使用公开产品 shell，未登录时显示登录提示；已登录时展示账户概览、我的查询、收藏机位、报告管理、套餐权益和安全设置。查询历史、收藏机位、报告管理和权益仍为占位，不接入支付、订阅或计费。
- 管理后台入口只在具备 `admin` / `super_admin` 角色或 `admin.manage` 权限的账户菜单、账户中心中显示；公开导航不展示顶层“管理后台”或单独“登录”主入口。
- 公开地点搜索：`GET /search/places?q=` 会先查本地地点和摄影机位，再使用当前 GeoProvider 返回标准化地点结果。
- 公开搜索选择态：选择地点后展示地点名称、地址 / 城市信息、数据来源、GCJ-02 / WGS84 经纬度、验证状态和本地机位匹配状态。
- 公开 forecast 查询基础：支持选择预报范围和分析目标，下一步跳转 `/forecast`，URL 中显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、预报范围、分析目标以及可用的本地地点 / 机位 ID。
- Forecast 计算核心 V1：已定义标准化小时天气、日天气、地形摘要、天文摘要、计算依据、计算输入和计算结果契约，`packages/calendar` 统一生成预报时间范围和中国本地日历信息，`packages/scoring` 提供本地 mock 天气/地形数据构造器、标准化天气输入 builder、真实本地天文摘要和可解释 rule-based 评分计算器。
- 公开 forecast 端点：`POST /forecast/validate-query` 只校验查询输入并返回中文标签；`POST /forecast/calculate` 默认使用 MockWeatherProvider 的标准化天气数据和本地模拟地形数据，同时使用本地 astronomy-engine 天文计算，不调用真实天气、地形、天文在线 API 或 AI 服务；`POST /forecast/ai-explain` 默认返回规则解读，只有后台启用 DeepSeek 服务商、启用真实调用且 Key 已保存时才请求真实 DeepSeek。
- 后台登录页：宽屏产品式登录布局、中文表单、样式化错误提示和单一返回前台入口。
- 后台控制台布局：约 252px 亮色侧栏、紧凑顶部标题区、当前管理员信息、主题切换、返回前台、退出登录和更宽的内容区域。
- 后台页面视觉层：系统设置、服务商配置、地点管理、机位管理、审计日志使用统一卡片、表格、表单、按钮、空状态、横向可滚动表格和更克制的自然色 active 状态。
- 受保护的后台 API、JWT 登录、数据库 RBAC、系统设置、服务商占位配置、地点/机位 CRUD、审计日志基础。

尚未实现：

- 真实天气数据驱动的 forecast / 预测结果、真实服务商接入和生产级决策建议。
- 真实天气服务商调用。
- 生产级 DeepSeek 或其他 AI 自动分析流程；当前只允许后台服务商配置显式启用后的 DeepSeek 解读调用。
- 支付、套餐、额度和商业化流程。
- 生产级 Cookie/Session 加固。
- 短信登录、真实查询历史、收藏机位持久化、额度控制、付费套餐、订阅计费和已保存报告；当前 `/account` 的查询、收藏、报告和权益模块为基础占位。

当前公开首页的地图、云层、地形和时间线仍是界面占位，只用于展示产品方向，不包含真实地图图层、真实天气图层或真实服务商调用。当前搜索与 forecast 流程已完成地点识别、坐标归一化、机位匹配、预报范围选择、分析目标选择、本地 mock 天气/地形预报输入构造、本地天文计算、摄影评分和 `/forecast` 结果展示；后续真实天气/地形 provider 接入、查询历史、收藏机位、支付和生产判断逻辑尚未实现。

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

当前 `/forecast` 是本地计算结果页，用于展示用户选择的地点、预报范围、分析目标、坐标信息和评分结果。页面会调用 `POST /forecast/calculate`，后端默认使用 `MockWeatherProvider` 输出的标准化天气数据、模拟地形摘要和 astronomy-engine 本地天文数据，并运行 deterministic rule-based 评分引擎。默认不会调用真实 QWeather、Open-Meteo、高德地图、DeepSeek、存储、支付或短信服务；高德地图和 DeepSeek 仅在后台服务商配置中启用真实调用、服务商已启用且 Key 已配置时允许真实调用，环境开关只作为旧配置兜底。

当前计算核心覆盖：

- Calendar Core V1：`packages/calendar` 集中处理 `Asia/Shanghai` 时区、24h / 48h / 72h / 7d 预报范围、覆盖日期、中文日期时间格式、农历和节气信息。
- 云海、白墙风险、朝霞、晚霞、星空、银河和通透度评分。
- 综合出片指数、推荐等级、最佳拍摄窗口、风险提示、关键依据和拍摄建议。
- Astronomy Core V1：使用 `astronomy-engine` 在本地 deterministic 计算日出 / 日落、太阳中天、民用 / 航海 / 天文晨昏光、月相、月亮照明、月出 / 月落和逐小时月亮高度。
- 银河窗口 V1：基于天文黑夜、近似银心 J2000 坐标、当地地平坐标和月光影响给出初步窗口、方向和可见性等级；该结果是拍摄规划基础估算，尚未完整建模银河拱桥、地形遮挡和光污染。
- 黄山光明顶、老君山金顶、三清山女神峰、武功山金顶等本地模拟样例。
- 数据提示：`当前天气数据和地形数据为本地模拟数据，天文数据由本地算法按 WGS84 坐标计算；整体结果仍不代表真实预报。`

天文计算约定：

- 天文计算只使用 WGS84 经纬度，不使用 GCJ-02。
- 默认时区为 `Asia/Shanghai`。
- 天文摘要使用 Calendar Core 生成的 `targetDates`，不会在 astro / scoring 内部再生成独立日期。
- 日出 / 日落、暮光、月相、月亮照明、月出 / 月落、逐小时月亮高度和银河窗口为本地 deterministic 计算，不调用在线 API。
- Astronomy Core 依赖本地 `astronomy-engine` 包；自动化测试会校验天文计算不触发网络请求。
- 天文结果会随 forecast mock pipeline 一起进入 `ForecastCalculationResult.astroSummaries`，供结果页展示日出日落、月相月照、月出月落、天文黑夜窗口和银河窗口。
- 真实天气准确率仍需要后续接入 QWeather / Open-Meteo 真实预报、云层 / 能见度校准和地形遮挡数据；DeepSeek 当前只解释确定性结果，不计算天气、天文、地形或评分。

日历与预报时间约定：

- 默认时区统一为 `Asia/Shanghai`，运行时使用实际当前时间，测试可显式注入固定 `now`。
- 支持的预报范围由 Calendar Core 统一生成：`24h`、`48h`、`72h` 和 `7d`。
- `forecastStart`、`forecastEnd`、`targetDates`、中文日期时间范围、最佳窗口展示标签和结果页“计算依据”均来自 Calendar Core。
- 朝霞、晚霞、云海、星空和银河评分窗口都会限制在 Calendar Core 生成的 `forecastStart` / `forecastEnd` 内，不输出预报起点之前的过去窗口，也不使用固定运行日期。
- `lunar-typescript` 用于本地农历、干支生肖和节气信息，不调用在线日历 API。
- 天文计算使用 Calendar Core 的覆盖日期和用户选择地点的 WGS84 经纬度；天气和地形在当前阶段仍为 mock / fixture，等待后续真实 provider 接入。

`packages/weather` 已提供天气服务商契约、ProviderFactory、QWeather / Open-Meteo fixture adapter 和小时/日天气标准化逻辑。QWeather fixture 会把不可用的低云/中云/高云分层置为 `null` 并写入 source notes；Open-Meteo fixture 会映射 `cloud_cover_low`、`cloud_cover_mid`、`cloud_cover_high`、能见度、露点、风速、阵风、降水概率和降水量。

真实准确率仍需要后续接入 QWeather / Open-Meteo 真实预报、地形 DEM、云层/能见度校准和历史天气数据回测。历史天气数据会用于后续校准、backtesting 和评分权重验证。当前本地开发和部署可在后台服务商配置页显式启用真实高德地图和 DeepSeek 便于人工测试；QWeather、Open-Meteo、存储、支付和短信仍保持本地 mock / interface-only，后续在 staging 或服务器环境测试。

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

当前查询契约由 `@photo-weather/shared` 中的 `forecastQueryInputSchema` 维护，前端 URL 会显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、预报范围、分析目标以及可用的本地地点 / 机位 ID。`POST /forecast/calculate` 会先复用该 schema 校验输入，再构造 `ForecastCalculationInput` 并返回 `ForecastCalculationResult`；可选 `useAiExplanation=true` 时会附带规则兜底解读，只有后台 `ai/deepseek` 启用真实调用且 Key 已保存时才尝试 DeepSeek。结果页按钮调用 `POST /forecast/ai-explain`，不会在页面加载时自动调用 DeepSeek。

公开用户邮箱密码登录和注册已接入 Public User Auth V1。当前公开导航使用统一“账户”入口；未登录时进入 `/login`，已登录时可进入 `/account`，管理员账号才会在账户菜单或账户中心看到“管理后台”。短信登录、真实查询历史、收藏机位持久化、额度控制和付费套餐计划在后续阶段实现，不属于当前 forecast 查询基础步骤。

## 架构

- `apps/web`：Next.js App Router 前端与后台控制台。
- `apps/api`：Fastify API 服务。
- `apps/worker`：未来任务队列 worker 占位。
- `packages/shared`：共享类型、Zod schema 和标签。
- `packages/config`：环境配置、运行时配置和密钥遮罩。
- `packages/db`：Prisma schema、迁移、seed、系统设置、服务商配置、地点、机位、审计日志。
- `packages/geo`：地理服务接口、deterministic mock 搜索、高德地图 Web 服务 provider、坐标校验与 GCJ-02 / WGS84 转换。
- `packages/calendar`：Calendar Core V1，集中处理 `Asia/Shanghai` 预报范围、覆盖日期、中文日期时间格式、农历和节气。
- `packages/weather`：天气服务接口、标准化天气模型、ProviderFactory、MockWeatherProvider，以及 QWeather / Open-Meteo fixture-based normalization adapters。
- `packages/terrain`：地形与海拔服务接口。
- `packages/astro`：Astronomy Core V1，基于 `astronomy-engine` 的本地 deterministic 日出 / 日落、暮光、月相、月亮照明、月出 / 月落、逐小时月亮高度和初步银河窗口估算。
- `packages/scoring`：本地 forecast mock 数据构造器、摄影评分 helper、朝霞/晚霞/云海/白墙/星空/银河/通透度计算器和综合推荐分类。
- `packages/ai`：AI 服务接口、mock provider、规则兜底和 DeepSeek 开发模式 JSON 解读 provider。
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
- 账户中心：`http://localhost:3000/account`
- 用户登录：`http://localhost:3000/login`
- 用户注册：`http://localhost:3000/register`
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

高德地图 Web 服务 Key 和“启用真实调用”开关优先在后台服务商配置页填写；环境变量仅作为旧配置或本机开发兜底，后台配置优先级更高：

```bash
ENABLE_REAL_AMAP=false
AMAP_API_KEY=
# 兼容部分部署命名：
AMAP_WEB_SERVICE_KEY=
AMAP_BASE_URL=https://restapi.amap.com
```

DeepSeek API Key、真实调用开关和模型选择同样优先在后台服务商配置页填写。普通管理员只需要填写 API Key、从下拉框选择 `deepseek-chat` 或 `deepseek-reasoner`、保存并测试连接；`.env.local` 只用于本机开发兜底，不要提交：

```bash
ENABLE_REAL_DEEPSEEK=false
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-chat
```

后台 `geo/amap` 已启用、`configJson.realCallEnabled=true` 且已配置高德 Web 服务 Key 后，公开地点搜索和后台高德测试连接可以请求真实高德 Web Service。若数据库配置中没有 `realCallEnabled` 字段，才会读取 `ENABLE_REAL_AMAP` 作为兜底。高德返回坐标按 GCJ-02 处理，并同步归一化为 WGS84；天气、天文、地形和评分计算仍只使用 WGS84。

后台 `ai/deepseek` 已启用、`configJson.realCallEnabled=true` 且已配置 DeepSeek API Key 后，forecast 结果页可以手动点击“生成智能解读”。若数据库配置中没有 `realCallEnabled` 字段，才会读取 `ENABLE_REAL_DEEPSEEK` 作为兜底。DeepSeek 只解释确定性输入中的评分、风险、最佳窗口、建议和备用方案，不计算或覆盖天气、天文、地形、坐标和评分；模拟数据场景下不得声称真实天气准确率。

本地自动化测试默认使用 `MockGeoProvider`、规则兜底和 mocked fetch，不会读取真实高德 / DeepSeek 密钥，也不会调用真实外部网络接口。

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

`/admin/providers` 提供可视化服务商配置表单。高德地图支持“启用该服务商”“启用真实调用”“高德 Web 服务 Key”和优先级；DeepSeek 支持“启用该服务商”“启用真实调用”“DeepSeek API Key”“模型选择”下拉框和优先级。其他服务商保留接口和 mock 配置。密钥保存后 API 只返回 `maskedSecretJson`，不会返回原始 `secretJson`；空密钥输入表示保留现有密钥不变，如需删除已保存字段请使用后台表单中的清除操作。

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
POST /auth/register
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
POST  /forecast/ai-explain

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

服务商测试连接默认仍为本地 mock，不调用真实外部服务。高德地图与 DeepSeek 是当前仅允许真实开发调用的例外：必须同时满足后台服务商已启用、后台“启用真实调用”已打开、API Key 已配置。若旧数据库记录缺少 `realCallEnabled` 字段，才会读取 `ENABLE_REAL_AMAP` / `ENABLE_REAL_DEEPSEEK` 作为兜底。

后台“测试连接”按钮会向 `/admin/providers/:providerType/:providerCode/test-connection` 发送 `{}`。未启用真实调用时，高德返回“当前为本地模拟测试，未请求高德地图服务。”，DeepSeek 返回“当前为本地模拟测试，未请求 DeepSeek 服务。”；启用真实调用但缺少 Key 时分别返回“请先填写高德 Web 服务 Key。”和“请先填写 DeepSeek API Key。”其他服务商仍返回通用本地模拟结果。自动化测试强制 mock，不启用真实服务商联调。接口响应和日志不得暴露原始密钥。

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
/login
/register
/account
/forecast
```

后台控制台已同步 Product UI redesign V4 的自然色和紧凑布局整理。公开导航不展示顶层“管理后台”按钮；后台入口只在已确认具备 `admin.manage` 权限的账户菜单或账户中心中显示：

- 左侧导航：控制台、系统设置、服务商配置、地点管理、机位管理、审计日志。
- 顶部标题区：当前页面标题、描述、当前管理员名称、主题切换、单一返回前台入口、退出。
- 内容区：使用可用宽度的卡片、表格、表单、空状态、确认弹窗和统一按钮。
- 移动端：侧栏转为顶部横向导航，表格允许横向滚动，避免手机、平板和常见笔记本宽度溢出。

后台路由会将未登录用户重定向到 `/admin/login`。公开用户登录和后台登录当前复用同一套浏览器 `localStorage` token 存储，这是开发阶段实现；正式公开部署前需要改为生产级会话方案。

## 外部服务边界

本阶段不允许自动化测试调用真实外部服务。当前自动化测试只使用 deterministic mock providers、fixture JSON、本地 astronomy-engine 天文计算、mocked fetch 和配置占位：

- 不调用真实 QWeather；只允许读取本地 QWeather fixture JSON。
- 不调用真实 Open-Meteo；只允许读取本地 Open-Meteo fixture JSON。
- 自动化测试不调用高德地图真实接口；真实高德只允许人工本地开发或部署环境中通过后台服务商配置显式启用，`ENABLE_REAL_AMAP` 只作为缺少后台字段时的兜底。
- 自动化测试不调用 DeepSeek；真实 DeepSeek 只允许人工本地开发或部署环境中通过后台服务商配置显式启用，`ENABLE_REAL_DEEPSEEK` 只作为缺少后台字段时的兜底。
- 天文计算只使用本地 `astronomy-engine`，不调用在线天文 API。
- 日历、农历和节气只使用本地 Calendar Core 与 `lunar-typescript`，不调用在线日历 API。
- 不调用真实存储、短信、支付或计费服务。

本地和测试默认天气服务商为 `mock`。如需验证服务商 adapter，只能显式设置 `WEATHER_PROVIDER=qweather|open_meteo` 且 `WEATHER_PROVIDER_MODE=fixture`；`WEATHER_PROVIDER_MODE=real` 当前会 fail closed，不会悄悄发起网络请求。除高德地图和 DeepSeek 的后台真实调用开关外，真实服务商联调应在后续阶段通过后台配置或环境旗标显式启用，并且只在 staging 或 production 环境按操作员意图执行。

高德地图 provider 当前只负责地点搜索、地理编码、逆地理编码和坐标归一化。地图展示使用 GCJ-02；天气、天文、地形、DEM 和后续评分计算必须使用 WGS84。DeepSeek 只负责解释确定性 forecast 结果，不负责计算真实天气、天文、地形或评分。

## Docker

`docker-compose.yml` 包含未来 `web`、`api`、`worker`、`postgres`、`redis`、`nginx` 服务骨架。`scripts/` 下脚本是后续一键安装、首个管理员创建和备份流程的基础。
