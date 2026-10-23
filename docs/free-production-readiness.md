# 免费版海外服务器与 Cloudflare 上线准备

检查日期：2026-10-23。适用范围：当前免费版，访客免注册、无广告、无订阅，天气只用和风天气与 Open-Meteo，正式地图使用高德；采用新数据库，不迁移旧记录。

**免费版上线适配已在本地完成，尚未部署或推送。** 本地生产构建与真实数据库联调通过；Linux Docker 整套启动、正式和风/高德凭据、Cloudflare 公网链路仍需在上线验收阶段完成。

## 本地修复结果

| 项目       | 已实现并检查                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 免费初始化 | `pnpm db:seed:free` 创建四项网站设置、和风/Open-Meteo/高德三个服务商及管理员。首次默认仅启用免费 Open-Meteo。无套餐、订单、历史用户或机位数据；重复执行不覆盖配置、密钥或管理员密码。检测到商业版记录则拒绝，不自动删除。 |
| 安装与更新 | 安装、恢复安装和更新均使用免费种子；更新先备份、迁移和校验，再切换 Web/API/Caddy。Worker 不默认启动，Python 天文服务为可选 profile。                                                                                      |
| 生产配置   | 使用真实免费天气；关闭登录绕过与本地预览；浏览器 `/api/service`，Web 服务端 `http://api:4000`；Web 构建先构建共享包。环境校验会拒绝占位符、错误连接地址和不安全模式。                                                     |
| 安全升级   | Next.js 15.5.28、React 19.3.1、Fastify 5.12.7，并修复邮件、存储 SDK 及间接依赖；锁文件已更新。2026-10-23 的 `pnpm audit --prod` 为 0 项已知漏洞；不是零风险保证。Caddy 固定到 2.11.7。                                    |
| Cloudflare | Origin CA 只读挂载；仅接受官方网段，严格解析访客 IP，Web/API 覆盖不可信 X-Forwarded-For；API 只信任固定 Caddy 私有 IP；API/后台强制 no-store，静态资源保留缓存。旧 `/billing` 返回 410。                                  |
| 本地实测   | 空白 PostgreSQL 迁移、管理员认证、重复初始化；生产 HTTP 登录、401、保存后前台生效、私钥不公开、Open-Meteo 连接与真实预报；前台四页和后台六页桌面/窄屏检查。                                                               |

升级依据：[Next.js 安全公告](https://nextjs.org/blog/nextjs-security-update-october-14-2026)、[Next.js 15 迁移](https://nextjs.org/docs/app/guides/upgrading/version-15)、[Fastify 5 迁移](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)、[Caddy 2.11.7](https://github.com/caddyserver/caddy/releases/tag/v2.11.7)。页面布局、颜色和现有交互设计保持不变。

## 推荐部署结构

```text
访客浏览器
  ├─ HTTPS → Cloudflare → Caddy → Web 3000
  │                           └→ /api/service/* → API 4000
  │                                                ├─ PostgreSQL
  │                                                ├─ Redis
  │                                                ├─ 和风天气 / Open-Meteo
  │                                                └─ 高德服务端接口与安全代理
  └─ 高德 JS SDK 与地图资源（由高德提供）
```

Web/API/数据库/Redis 均在 Docker 私有网络内。宿主机不公开 3000、4000、4100、5432、6379，也不使用本机开发的 3100、4101、55432 作为正式入口。SSH 只向管理来源开放；同时核对云安全组和 Docker 实际端口映射。

首发按单台 Linux 服务器、单 API 实例设计。可按 **2 核 4 GB 内存、40 GB 以上 SSD** 作为不带大体积栅格数据的小流量试运行预算；这是容量估算，尚非压测结论。同机编译宜留更多内存，或在独立 Linux 构建环境生成镜像。数据集、历史记录和备份需要另算磁盘空间。服务器地域在选购前用国内网络与三个上游实际测速决定，不仅看距离。

当前 Worker 只输出空闲心跳，没有实际队列工作，现已从默认启动项移除（保留 legacy-worker profile）。Redis 先保留，避免同时变更现有生产环境约束。当前天气缓存是进程内缓存，启动 Redis 不会自动把它变成共享缓存；首发不增加多个 API 副本。

### 地形与天文服务

原项目仍有 DEM 地形、光污染和天空亮度栅格挂载与 API 接口。当前免费版本地启动默认关闭 Python 天文服务，本轮生产模板也默认关闭，API 不再强依赖它。

默认沿用本地运行模式。需要 Python 服务时，设置 `ENABLE_ASTRO_SERVICE=true`；安装/更新脚本自动启用 `astro` profile，手动 Compose 命令需加 `--profile astro`。若首发要启用原 DEM 地形能力，需另行准备栅格、元数据和星历文件，验证文件挂载、覆盖范围、缺失回退、内存及接口结果；仅启动容器不代表数据已经加载。它们是本地计算/静态数据集，不需要增加第三家天气服务。暂未启用的数据不能在界面上标成已使用的精确地形结果。

## 你需要准备的资料

| 资料       | 用途及准备方式                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 正式主域名 | 确定使用根域名还是 `www`，另一入口重定向；建议另备 `staging` 子域名用于验收。                                             |
| 海外服务器 | 公网 IP、实际出口 IP、系统版本、CPU/内存/磁盘，现有 SSH 别名或密钥登录方式。无需现在发送密码。                            |
| Cloudflare | 能管理该域名的账号和 DNS 权限；确认 NS 生效、现有 DNS/MX 记录已保留。网站后台不需要 Cloudflare 全局密钥。                 |
| 源站证书   | 建议使用覆盖正式及验收域名的 Cloudflare Origin CA 证书及私钥，后续只放服务器受限目录。也可选择有明确续期方案的公信证书。  |
| 正式管理员 | 自己使用的管理员邮箱、独立强密码；不复用 `admin@local.test` 或本地随机密码。当前无需配置短信或邮件注册服务。              |
| 和风       | 本账号 API Host、API KEY，相关数据权限与可用额度。                                                                        |
| 高德       | 原账号下有效的 Web 服务 Key、Web 端 JS API Key、配套安全密钥；正式域名白名单、服务器出口 IP 白名单和剩余额度。            |
| 网站信息   | 正式名称、HTTPS 地址，默认 `zh-CN`、`Asia/Shanghai`；核对页脚现有备案号是否确实对应此次域名和主体，不直接沿用无关旧信息。 |

凭据以后直接在管理员后台或服务器受限环境文件中填写，不要发到聊天、截图、Git 或公开工单。生产 PostgreSQL/Redis 密码和应用 `JWT_SECRET` 在部署时独立随机生成；应用登录 JWT 与和风的 JWT 认证是两回事。

### 和风天气填写与验收

进入 `/admin/providers/weather` 的和风配置：

| 后台字段               | 填什么                                                                                      | 对应环境变量             |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| API Host               | 从和风控制台设置页复制专属域名，例如 `你的分配值.qweatherapi.com`，不填协议、路径或 API Key | `QWEATHER_API_HOST`      |
| 和风天气 API Key       | 项目凭据中认证方式为 **API KEY** 的值                                                       | `QWEATHER_API_KEY`       |
| 启用真实调用           | 开启                                                                                        | 以后台保存配置为准       |
| 服务启用               | 保存完整凭据后开启                                                                          | 以后台保存配置为准       |
| 超时、重试、单位、语言 | 初始可用 10000 ms、1 次、公制、中文；根据海外服务器实测再调                                 | `QWEATHER_TIMEOUT_MS` 等 |

当前程序使用请求头 `X-QW-Api-Key`，没有和风 JWT 私钥签名实现。不要把项目 ID、凭据 ID 或 JWT 私钥填进 API Key。官方建议优先使用 JWT，并已说明 **2027-01-01 起 API KEY 认证将限制每日请求量**，因此长期运行还需安排 JWT 接入；现在按现有 API KEY 接口验收。[认证说明](https://dev.qweather.com/en/docs/configuration/authentication/)。

必须用自己的 API Host，不能抄旧教程的 `devapi.qweather.com`、`api.qweather.com` 或 `geoapi.qweather.com`。[API Host 说明](https://dev.qweather.com/en/docs/configuration/api-host/)。

当前代码实际调用以下接口，账号需逐项可用：

- 实时天气：`/v7/weather/now`，后台连接测试使用它。
- 小时天气：`/v7/weather/24h`、`/v7/weather/72h`，三天预报要验收 72 小时数据权限。
- 每日天气：`/v7/weather/7d`；扩展长范围请求时还可能使用 `/v7/weather/15d`。
- 天气预警：`/weatheralert/v1/current/{纬度}/{经度}`。当前已使用新预警路径；不要恢复已退役的 `/v7/warning/now`。[官方退役列表](https://dev.qweather.com/en/docs/deprecated/)。

当前和风空气质量方法返回不可用，并没有接通和风空气质量接口；后台旧帮助文案需要同步纠正。当前小时适配最多选择 72h 接口，不能因为模型支持 168 小时就宣称已有七天逐小时和风预报。这些不是填写更多密钥就会自动开启的功能。

测试顺序：保存 → 实时连接测试 → 前台今天与三天查询 → 检查来源包含真实和风数据 → 检查预警及缺数据提示。实时连接测试成功只证明 `/now` 可用。对于来源不足或权限不足，应清楚显示实际可用来源，不能把 Open-Meteo 回退结果算作和风验收通过。

### 高德配置填写与验收

进入 `/admin/providers/geo`：

| 后台字段               | 用途                         | 凭据要求                                                                                             |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 高德 Web 服务 Key      | 服务端地理接口及后台连接测试 | 选择 Web 服务类型；对应 `AMAP_WEB_SERVICE_KEY`，已有别名 `AMAP_API_KEY` 也被支持，避免同时填不同值。 |
| 高德 Web 端 JS API Key | 浏览器加载真实地图底图       | 对应 `AMAP_JS_API_KEY`；使用 JS API 类型 Key，设置正式及验收域名白名单。                             |
| 高德 JS API 安全密钥   | JS API 请求的服务端安全代理  | 与 JS Key 配套，对应 `AMAP_SECURITY_JS_CODE`；不会下发给浏览器。                                     |
| 启用真实调用与服务启用 | 允许使用正式高德接口         | 两者开启后保存；环境回退开关为 `ENABLE_REAL_AMAP=true`，不能代替数据库启用。                         |

两类 Key 不能互换。JS Key 按 SDK 工作方式会出现在浏览器请求中，安全依靠域名限制及服务端保管安全密钥。当前同源代理是 `/api/service/maps/_AMapService`，Caddy 和 Cloudflare 必须原样保留路径及查询参数；它不应被 CDN 缓存。[高德安全密钥说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)、[Web 服务入门](https://lbs.amap.com/api/webservice/gettingstarted)。

Web 服务的 IP 白名单填**服务器访问高德时的真实出口 IP**，不是访客 IP，也不是 Cloudflare 边缘 IP。若服务器经 NAT 或 IPv6 出网，要按实际出站情况配置。原 Key 可以继续使用，前提是类型、账号状态、额度和白名单均有效。[高德错误码及白名单说明](https://lbs.amap.com/api/webservice/guide/tools/info/)。

必须分开验收：后台 Web 服务测试；`/maps/config` 返回 JS Key 但没有安全密钥；真实地图加载；同源安全代理返回正常；地图缩放/拖动/选点；手机定位。前台输入地名搜索目前主要使用 Open-Meteo，不能仅凭搜索成功判断高德已经接通。正式环境不会自动切换本地 OSM 预览底图。

## 免费模式与接口额度

访客免费、免注册的方向保持不变。服务器和域名仍有运营成本，数据供应商也有配额；不把“用户不用付费”写成“上游无限免费”。

| 服务       | 当前官方说明                                                                                       | 上线动作                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Open-Meteo | 免费接口适用于非商业使用，限制为每分钟 600、每小时 5000、每天 10000 次；价格页另列每月 300000 次。 | 保持 free 模式、无广告无订阅、保留署名。统计上游调用，达限时降频或暂停，不能通过换 IP/Key 绕过。     |
| 和风       | 天气及基础服务当前价格组前 50000 次/月免费，超过后按量收费。                                       | 在控制台确认账号额度、共享计量和限额选项；如运营预算要求零 API 费用，必须在超额前停止调用该源。      |
| 高德       | 官方配额页注明非商业个人等账号的免费月配额有自认证起一年期限；服务类别分别计量。                   | 先检查原账号认证时间、当前剩余额度、有效期和控制台实际规则。旧账号免费额度是否仍有效不能从代码判断。 |

来源：[Open-Meteo 条款](https://open-meteo.com/en/terms)、[价格页](https://open-meteo.com/en/pricing)、[和风价格](https://dev.qweather.com/en/docs/finance/pricing/)、[高德配额说明](https://lbs.amap.com/upgrade)。

一次前台查询可能触发多个上游请求：实时、小时、每日、预警、不同模型以及 ICON 分层云量；重试和历史校准也会增加用量。页面访问数不能当作上游请求数。现有按 IP 限流、进程缓存和使用日志可以保留，但它们不是全站每日/月度预算保护。若要求 API 费用保持为零，上线前需补供应商用量阈值和停止调用机制，并以供应商实际计量核对，不能只靠日志事后发现。

初始 Open-Meteo 模型沿用已联调的 `best_match,gfs_seamless`、上限 2；ICON 是独立补充，限制为 2 不等于每次查询只消耗两次上游请求。保留网页和导出图片的数据来源，预警另核对官方来源字段展示。[和风署名要求](https://dev.qweather.com/en/docs/terms/attribution/)。

## Cloudflare 与源站配置

### 域名与 HTTPS

1. 将正式域名接入 Cloudflare，保留原有邮件等 DNS 记录；为网站设置正确 A 记录。只有实际可达的源站 IPv6 才增加 AAAA。
2. Caddy 安装覆盖目标域名的源站证书，Cloudflare 使用 **Full strict**。不使用 Flexible，避免回源明文和重定向循环。[Full strict 要求](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)。
3. 推荐本方案使用 Origin CA：证书放 `deploy/certs/origin.pem`，私钥放 `deploy/certs/origin.key`，模板已只读挂载。`scripts/check-cloudflare.sh` 检查域名匹配、至少剩余 7 天有效期和公私钥配对。证书目录已排除 Git 与 Docker 构建上下文。启用代理后仍需验收证书链。[Origin CA 配置](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)。
4. Origin CA 仅供 Cloudflare 信任，浏览器直接绕过 Cloudflare 访问源站会提示证书不受信任。不要用关闭橙云作为这种证书方案的直接回滚办法。若选择 Caddy 自动公信证书，则应在收紧防火墙前确认挑战验证和后续续期路径。
5. 正式与验收域名分别完成边缘证书、重定向和 HTTPS 验证，再打开强制 HTTPS。先不启用不可轻易撤回的 HSTS preload。

### 缓存规则

推荐先保持 Cloudflare 默认缓存行为，只对已确认可缓存的静态资源增加规则。Cloudflare 默认不缓存普通动态 HTML，且不会替网站缓存第三方域名资源。[默认缓存行为](https://developers.cloudflare.com/cache/get-started/)。

| 路径或请求                                                 | 建议                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/_next/static/*`                                          | 可缓存带哈希的 JS/CSS，遵循应用发出的 Cache-Control；验收重复请求能命中。 |
| 已确认公开的静态图标与图片                                 | 遵循源站缓存头，按需缓存，不自动扩大到所有路径。                          |
| `/api/*`，包括 `/api/service/*`                            | 明确 Bypass cache，涵盖预报、配置、鉴权、连接测试、高德代理、搜索、校准。 |
| `/admin`、`/admin/*`、`/admin-preview`、`/admin-preview/*` | 明确 Bypass cache；预览路由在生产还必须不可用，缓存规则不是访问控制。     |
| `/`、`/astro`、`/glow`、`/map` 等动态页面                  | 不设 Cache Everything，按动态页面回源，保证网站名称和配置生效。           |
| 带 Authorization 的请求和写请求                            | 不缓存，不用边缘 TTL 强制覆盖 no-store/private。                          |

不要创建随后又覆盖 Bypass 的全站缓存规则；检查已有 Page Rules/Cache Rules 冲突。API 全局已设置 `Cache-Control: no-store`；Caddy 对后台/API 在响应发送前覆盖该值，避免上游缓存头覆盖保护。Cache Rules 若强行忽略源站头，仍可能缓存原本不应缓存的响应，因此必须实测。[缓存判断说明](https://developers.cloudflare.com/cache/troubleshooting/investigating-uncached-responses/)。

初期不要增加 Rocket Loader 或全站脚本改写，避免干扰 Next.js 与高德 SDK 的加载顺序。WAF 挑战不应让正常 API 请求拿到 HTML 验证页；通过真实交互调整规则，不能为方便直接关闭全站防护。

### 真实 IP 与防火墙

源站 80/443 只接受 Cloudflare 公布的 IPv4/IPv6 网段和明确的维护通道；SSH 单独限制管理来源。更新网段时保留恢复通道，并用外部网络实测容器端口不可直接访问。[Cloudflare 源站 IP 说明](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)。

Caddy 只信任官方网段的 `CF-Connecting-IP`，以 `{client_ip}` 重写转发头。API 通过 `API_TRUSTED_PROXIES` 仅信任 Caddy 默认地址 `172.30.80.2/32`；生产禁止 `API_TRUST_PROXY=true`。默认 Docker 子网为 `172.30.80.0/24`，若与现有网络冲突，需同时修改子网、Caddy 地址和可信代理值。网段更新时同步修改 `deploy/cloudflare.caddy` 中两处列表。伪造头与限流已本地测试，公网仍需验证。

Caddy 标准镜像内置的是 `trusted_proxies static`，不能直接照搬需要额外插件的 `trusted_proxies cloudflare` 示例。官方建议对追加式代理链使用严格解析；具体配置需和最终 Caddy 版本一起验证。[Caddy 可信代理说明](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)。

Cloudflare 免费全球网络不包含中国大陆专用网络；国内访问仍可能跨境，并不保证比直连快。必须从移动、联通、电信的实际网络检查静态页面和动态查询。Cloudflare 加速本站也不会自动加速服务器向和风/Open-Meteo 发起的请求或高德自己的 SDK 域名。[Cloudflare 中国网络说明](https://developers.cloudflare.com/china-network/)。

## 生产配置应对齐的值

下表已写入生产模板；本地没有生成正式 `.env.production`，也未应用到服务器。不要直接复制本地 `.env.local` 或 `.runtime`。

| 项目                                                    | 目标                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV` / `APP_ENV`                                  | `production`                                                                         |
| `SITE_URL` / `PUBLIC_SITE_URL` / 后台网站地址           | 同一个正式 HTTPS 地址                                                                |
| `NEXT_PUBLIC_API_BASE_URL`                              | `/api/service`；这是构建时值，修改后须重建 Web 镜像                                  |
| Web `API_BASE_URL`                                      | `http://api:4000`；服务端取配置使用，构建时 rewrite 也须与代理设计对齐               |
| `DATABASE_ENABLED`                                      | `true`，使用全新生产库；不指向本地 55432                                             |
| `DATABASE_URL`                                          | Docker 内部 `postgres:5432`；用独立账号和随机密码，密码在 URL 中正确编码             |
| `REDIS_URL`                                             | Docker 内部 Redis、独立随机密码                                                      |
| `JWT_SECRET`                                            | 独立生成至少 32 字符的高熵随机值，稳定保存，不随重启变化                             |
| `ADMIN_AUTH_BYPASS`                                     | `false`                                                                              |
| `LOCAL_ADMIN_PREVIEW` / `LOCAL_MAP_PREVIEW`             | `false`                                                                              |
| `WEATHER_PROVIDER` / `WEATHER_PROVIDER_MODE`            | `open_meteo` / `real`，同时初始化数据库真实调用状态                                  |
| `OPEN_METEO_ENABLED` / `OPEN_METEO_MODE`                | `true` / `free`                                                                      |
| `OPEN_METEO_BASE_URL`                                   | `https://api.open-meteo.com`，其余专用 Open-Meteo 数据接口沿用代码配置               |
| `OPEN_METEO_API_KEY` / `OPEN_METEO_CUSTOMER_ENDPOINT`   | 留空，不引入商业模式                                                                 |
| `OPEN_METEO_MODEL_LIST` / `OPEN_METEO_MODEL_LIST_LIMIT` | `best_match,gfs_seamless` / `2`，后台初始配置保持一致                                |
| 和风与高德凭据                                          | 优先从后台保存至新库，避免环境和后台同时维护冲突值；缺凭据时不启用对应来源           |
| `ENABLE_ASTRO_SERVICE`                                  | 默认 `false`，已移除强制依赖；启用时另验数据集和接口                                 |
| 公开接口限流                                            | 保持启用；可信客户端 IP 已修复，阈值按正式流量验证；本地限流不等于供应商月度预算上限 |

后台密钥当前存于数据库 `secretJson`，管理接口回显脱敏不等于数据库内加密。数据库导出与环境备份均按含密钥文件保管，限制权限并加密异地副本。生产环境文件不能被 COPY 到镜像或提交 Git。

## 后续上线步骤

代码适配已完成。以下服务器、账号与正式流量操作均尚未执行；得到上线授权后再操作。

1. **复核本地验收记录。** 本轮适配与测试结果见文末。先解决 Linux 容器、正式凭据与公网链路的未验项目，不将 Windows 本地构建等同于生产环境验收。
2. **制作可重复构建的版本。** 收齐当前未提交及未跟踪的免费版源文件，完成审阅后生成明确版本的发布包或镜像；不要仅拉取远端旧版本。发布包不含 `.env*` 私密文件、`.runtime`、备份或本地数据库。记录源码版本、锁文件和镜像摘要。
3. **在隔离的 Linux 验收环境构建。** 准备新 PostgreSQL 卷、Redis、专属管理员及稳定签名密钥。可保留现有生产 PostgreSQL 16 方案，但必须实际验证全部迁移，包括 `pg_trgm` 扩展；Windows 本地使用的 PostgreSQL 17 数据目录不能直接挂给生产 16 容器。
4. **初始化新库。** 先运行 `db:migrate`，再运行 `db:seed:free`；只创建免费版记录。确认零套餐、零订单、无旧用户、无旧地点记录。生产不复制本地联调历史记录。不要用旧 `db:seed` 或 Windows `setup:free-local` 代替。
5. **启动服务并验证源站。** 核对健康状态、管理员登录/退出/401、后台保存后重启仍保留、Web 服务端配置读取，以及公开接口不泄漏密钥。此时先不开放正式流量。
6. **接入验收域名与 Cloudflare。** 安装源站证书、配置 Full strict、DNS 代理、Bypass 规则、可信 IP 和防火墙；从外网确认 HTTPS、回源及客户端 IP 正确。使用同样链路做验收，避免只有直连测试。
7. **填入正式服务商资料并完整验收。** 配置和风、高德，执行下节检查。验收域名应在高德白名单中，服务端出口 IP 与最终生产环境保持一致或分别加入白名单。
8. **做备份恢复演练。** 导出新库和配置，在隔离空库恢复，确认管理员、服务商配置和网站设置可读。准备加密异地副本；备份失败时停止上线流程。
9. **经上线授权后再切正式域名。** 更新后台正式网站地址及构建时站点地址，重新构建受影响镜像，核对高德正式域名白名单和证书。切流后重复关键验收，观察错误率、请求耗时、用量及磁盘。
10. **保留回退路径。** 保存上一套镜像和配置。代码回滚先确认数据库结构兼容；需要回退数据库时恢复上线前备份，不盲目倒跑迁移。首次发布没有旧免费版镜像时，回退到维护页并停止公开查询，保留数据库用于排查。不得用 `down -v` 删除持久卷。

后续可使用 `bash scripts/install.sh`（准备好源站证书后），或按以下顺序手动验收。命令仅供说明，本轮没有执行生产操作：

```bash
# 从生产模板安全生成 .env.production，替换全部占位符，准备 deploy/certs 下的证书
bash scripts/check-env-production.sh
set -a
. ./.env.production
set +a
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" deploy/Caddyfile.template > deploy/Caddyfile
bash scripts/check-cloudflare.sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull web api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps api corepack pnpm db:migrate
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps api corepack pnpm db:seed:free
# 核对管理员权限后启动应用；不会创建套餐和订单
docker compose --env-file .env.production -f docker-compose.prod.yml up -d api web caddy
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

`scripts/backup.sh` 现备份 PostgreSQL、环境文件、Caddy 配置/证书、存在的校准目录和镜像清单。栅格和上传卷仍需另行备份或保留可验证的重建来源；镜像清单本身不等于保存镜像。更新必须先成功备份。数据库备份里含服务商密钥，备份目录应设置严格权限，定期备份到服务器之外并验证恢复。

## 正式链路验收清单

- [ ] `/`、`/astro`、`/map`、`/weather` 无需登录即可用；天气全部不可用时显示明确错误，不生成模拟天气充数。
- [ ] `/cloud-sea`、`/glow` 等兼容入口跳转符合设计，原注册、套餐、支付及机位管理入口没有重新出现。
- [ ] 三天日期、跨午夜星空窗口、时区、小时详情、地图位置与四类预报来源正确。
- [ ] 和风各数据接口及高德 JS/Web 两类接口分别成功，失败时能定位到权限、额度、白名单或网络问题。
- [ ] 正式地图只用高德，SDK 标识正常，地图拖动、缩放、列表切换与定位不被遮挡。
- [ ] 新后台六页可用；未登录 API 拒绝访问，退出后凭据撤销，生产预览不可用。
- [ ] 后台改变网站名称后，刷新、首次 HTML、页面标题与分享信息一致；改天气启用状态后，同坐标查询不会被浏览器、API 或 CDN 旧缓存覆盖。
- [ ] `/api/service/site/config`、`/api/service/maps/config` 与后台/鉴权响应没有缓存命中；`/_next/static` 的可缓存资源重复请求可命中。检查 `Cache-Control` 和 `CF-Cache-Status`，不能只看页面似乎正常。
- [ ] 源站外部端口检查、伪造转发头测试和限流验证通过；高德地图加载不会因共用每 IP 阈值而误触发大量 429。
- [ ] Android Chrome、iPhone Safari 以及需要支持的微信浏览器检查定位权限、触摸滚动、横竖屏、分享图片保存与失败提示。此前窄屏模拟不能代替真机。
- [ ] 国内至少两种运营商网络完成首次加载与查询测速；记录冷缓存/热缓存、地图加载和上游耗时，而不是只测首页。
- [ ] 进程和服务器重启后配置、登录签名密钥、数据库记录仍在；磁盘、备份、用量和证书到期有检查办法。
- [ ] 页脚、预报、分享图片的来源署名，以及隐私/预报说明与实际功能一致；不含无关旧域名和身份信息。

## 本轮检查范围与结果

- 前端全量 623 项、后端 361 项回归通过；另有免费初始化 5 项、生产配置校验器 5 项测试。后端最终模板断言调整后定向复跑 34 项部署测试通过。
- API 及工作区依赖编译、Next.js 生产构建通过，静态生成阶段 40/40 完成；新增初始化/可信代理代码 ESLint 通过。Bash 脚本语法和完整测试环境的 Compose 解析通过。
- 在独立空白 PostgreSQL 17 本地库执行全部生产迁移，验证免费记录、管理员权限/密码、重复执行保留配置与密钥；未迁移或改写原本地库。
- 用本机生产 API 与 `next start` 实测登录、未登录 401、设置保存、首次 HTML/标题/时区生效、高德公开配置私钥隔离、注册/收费 API 410，以及 Open-Meteo 真实连接和页面预报。
- Caddy 2.11.7 官方 Windows 二进制经官方 SHA-512 校验；生产模板适配/证书加载通过。本机代理实测覆盖直连拒绝、受信 IP 覆盖伪造头、两种 API 路径、后台/API no-store、静态缓存和旧计费路由 410。模拟可信代理使用仅存在于临时测试文件的回环地址，生产模板没有信任回环客户端。
- 浏览器检查 320、390、1440 像素宽度的四个前台页、登录及六个后台页；没有页面级横向溢出或浏览器控制台错误。窄屏模拟不能替代实体手机。
- 本机 Docker 引擎管道不可用，未完成 Linux 镜像实际构建与 Compose 整套运行；本地 Node 24/PostgreSQL 17 验证不能替代生产 Node 22/PostgreSQL 16 验收。正式和风、高德、Origin CA、DNS、Cloudflare 边缘缓存、运营商网络、备份恢复仍待外部环境验收。
- 未创建正式 `.env.production`，未操作 Cloudflare/服务商账号，未部署、提交或推送。临时测试数据库仅在本机，正式部署应使用新空库。
