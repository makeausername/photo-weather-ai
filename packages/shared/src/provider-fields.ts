export type ProviderFieldTarget = "configJson" | "secretJson";

export type ProviderFieldControl = "text" | "select" | "number" | "boolean";

export type ProviderFieldOption = {
  readonly value: string;
  readonly label: string;
};

export type ProviderFieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly target: ProviderFieldTarget;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly password?: boolean;
  readonly control?: ProviderFieldControl;
  readonly options?: readonly ProviderFieldOption[];
  readonly advanced?: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
};

export type ProviderFieldPreset = {
  readonly providerCode: string;
  readonly helpText?: string;
  readonly fields: readonly ProviderFieldDefinition[];
};

export const qWeatherDefaultApiHost = "";

export const qWeatherDefaultBaseUrl = qWeatherDefaultApiHost;

export const qWeatherApiHostPlaceholder = "xxxxx.qweatherapi.com";

export const qWeatherDefaultTimeoutMs = 10000;

export const qWeatherDefaultLanguage = "zh";

export const qWeatherDefaultUnit = "m";

export const qWeatherUnitOptions = [
  {
    value: "m",
    label: "公制（m）",
  },
  {
    value: "i",
    label: "英制（i）",
  },
] as const satisfies readonly ProviderFieldOption[];

export const openMeteoDefaultBaseUrl = "https://api.open-meteo.com/v1";

export const openMeteoFreeEndpoint = "https://api.open-meteo.com";

export const openMeteoCustomerEndpoint = "https://customer-api.open-meteo.com";

export const openMeteoDefaultModel = "forecast";

export const openMeteoForecastModelListDefault = "best_match,gfs_seamless,gfs_global";

export const openMeteoModeOptions = [
  {
    value: "free",
    label: "免费开发模式",
  },
  {
    value: "customer",
    label: "商业客户模式",
  },
] as const satisfies readonly ProviderFieldOption[];

export const meteoblueDefaultBaseUrl = "https://my.meteoblue.com";

export const meteoblueDefaultPackages = "basic-1h,clouds-1h";

export const weatherDefaultTimeoutMs = 10000;

export const weatherDefaultRetryCount = 1;

export const wechatPayDefaultApiBaseUrl = "https://api.mch.weixin.qq.com";

export const alipayDefaultGatewayUrl = "https://openapi.alipay.com/gateway.do";

export const paymentDefaultTimeoutMs = 10000;

export const wechatPayModeOptions = [
  {
    value: "native",
    label: "Native 扫码支付",
  },
  {
    value: "h5",
    label: "H5 支付",
  },
  {
    value: "jsapi",
    label: "JSAPI 支付",
  },
] as const satisfies readonly ProviderFieldOption[];

export const alipayModeOptions = [
  {
    value: "page",
    label: "电脑网站支付",
  },
  {
    value: "wap",
    label: "手机网站支付",
  },
] as const satisfies readonly ProviderFieldOption[];

export const alipaySignTypeOptions = [
  {
    value: "RSA2",
    label: "RSA2",
  },
] as const satisfies readonly ProviderFieldOption[];

export const aliyunCdnRefreshTypeOptions = [
  {
    value: "file",
    label: "URL 文件",
  },
  {
    value: "directory",
    label: "目录",
  },
] as const satisfies readonly ProviderFieldOption[];

export const tencentCdnPurgeTypeOptions = [
  {
    value: "url",
    label: "URL",
  },
  {
    value: "path",
    label: "路径目录",
  },
] as const satisfies readonly ProviderFieldOption[];

export const tencentCaptchaDefaultEndpoint = "https://captcha.tencentcloudapi.com";

export const tencentCaptchaDefaultSdkUrl = "https://turing.captcha.qcloud.com/TCaptcha.js";

export const tencentCaptchaDefaultCaptchaType = 9;

const keepExistingSecretPlaceholder = "留空则保持现有密钥不变";

export const providerFieldPresets = [
  {
    providerCode: "qweather",
    helpText: "中国大陆主天气源，用于实时天气、逐小时预报、天气预警、空气质量和基础天气数据。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求和风天气服务。",
      },
      {
        key: "apiKey",
        label: "和风天气 API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "保存后仅显示脱敏结果，不会在前端暴露。",
      },
      {
        key: "apiHost",
        label: "API Host",
        target: "configJson",
        placeholder: qWeatherApiHostPlaceholder,
        defaultValue: qWeatherDefaultApiHost,
        helpText:
          "在和风天气控制台的开发者信息中复制，例如 xxxxx.qweatherapi.com，不需要填写 https://。",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: qWeatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
      {
        key: "language",
        label: "语言",
        target: "configJson",
        placeholder: qWeatherDefaultLanguage,
        defaultValue: qWeatherDefaultLanguage,
        advanced: true,
      },
      {
        key: "unit",
        label: "单位",
        target: "configJson",
        control: "select",
        options: qWeatherUnitOptions,
        defaultValue: qWeatherDefaultUnit,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "open_meteo",
    helpText:
      "用于云层分层、能见度、露点、气压、风和多模型交叉验证。免费开发模式适合评估，商业客户模式用于后续生产接入。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求真实天气服务。",
      },
      {
        key: "mode",
        label: "调用模式",
        target: "configJson",
        control: "select",
        options: openMeteoModeOptions,
        defaultValue: "free",
        helpText: "免费开发模式无需 Key；商业客户模式请填写 API Key 和 Customer Endpoint。",
      },
      {
        key: "apiKey",
        label: "Open-Meteo API Key（可选）",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "如使用商业版 Open-Meteo，可填写 API Key；普通体验模式可保持为空。",
      },
      {
        key: "customerEndpoint",
        label: "Customer Endpoint",
        target: "configJson",
        placeholder: openMeteoCustomerEndpoint,
        defaultValue: openMeteoCustomerEndpoint,
        helpText: "商业客户模式使用；免费开发模式可保持默认值，系统不会把 Key 暴露到前端。",
      },
      {
        key: "modelPreference",
        label: "模型偏好",
        target: "configJson",
        placeholder: "best_match",
        advanced: true,
      },
      {
        key: "modelList",
        label: "模型列表",
        target: "configJson",
        placeholder: openMeteoForecastModelListDefault,
        defaultValue: openMeteoForecastModelListDefault,
        helpText:
          "用英文逗号分隔，系统会把多个模型作为独立校验源参与融合；普通生产建议保留默认。",
        advanced: true,
      },
      {
        key: "iconModel",
        label: "ICON 云层模型",
        target: "configJson",
        placeholder: "icon_global",
        defaultValue: "icon_global",
        advanced: true,
      },
      {
        key: "timezone",
        label: "时区",
        target: "configJson",
        placeholder: "Asia/Shanghai",
        defaultValue: "Asia/Shanghai",
        advanced: true,
      },
      {
        key: "defaultModel",
        label: "默认模型",
        target: "configJson",
        placeholder: openMeteoDefaultModel,
        defaultValue: openMeteoDefaultModel,
        advanced: true,
      },
      {
        key: "baseUrl",
        label: "Base URL（接口地址）",
        target: "configJson",
        placeholder: openMeteoDefaultBaseUrl,
        defaultValue: openMeteoDefaultBaseUrl,
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "meteoblue",
    helpText: "meteoblue 可作为专业增强天气源，用于 Forecast API 真实测试和后续多源融合。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求 meteoblue 服务。",
      },
      {
        key: "apiKey",
        label: "meteoblue API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "packages",
        label: "数据包 / Packages",
        target: "configJson",
        placeholder: meteoblueDefaultPackages,
        defaultValue: meteoblueDefaultPackages,
        helpText:
          "多个数据包用英文逗号分隔，例如 basic-1h,clouds-1h。Free Weather API 可用于 Forecast API 测试。",
      },
      {
        key: "baseUrl",
        label: "Base URL",
        target: "configJson",
        placeholder: meteoblueDefaultBaseUrl,
        defaultValue: meteoblueDefaultBaseUrl,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "amap",
    helpText:
      "高德 Web 服务 Key 用于地点搜索、地理编码和逆地理编码。启用真实调用后，前台地点搜索会请求高德地图服务。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "启用后，前台地点搜索和测试连接会请求高德地图服务。",
      },
      {
        key: "apiKey",
        label: "高德 Web 服务 Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "baseUrl",
        label: "高德 Web 服务 Base URL",
        target: "configJson",
        placeholder: "https://restapi.amap.com",
        defaultValue: "https://restapi.amap.com",
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "wechat_pay",
    helpText:
      "微信支付用于国内订单收款。默认使用 Native 扫码支付；真实调用开启前，测试连接只做配置和密钥格式检查。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时仅创建站内待支付订单，不请求微信支付接口，也不会提前发放权益。",
      },
      {
        key: "mode",
        label: "支付模式",
        target: "configJson",
        control: "select",
        options: wechatPayModeOptions,
        defaultValue: "native",
      },
      {
        key: "appId",
        label: "AppID",
        target: "configJson",
        placeholder: "微信支付绑定的 AppID",
      },
      {
        key: "mchId",
        label: "商户号",
        target: "configJson",
        placeholder: "微信支付商户号",
      },
      {
        key: "notifyUrl",
        label: "支付通知地址",
        target: "configJson",
        placeholder: "https://example.com/billing/wechat-pay/notify",
      },
      {
        key: "returnUrl",
        label: "支付完成返回地址",
        target: "configJson",
        placeholder: "https://example.com/pricing",
      },
      {
        key: "merchantSerialNo",
        label: "商户证书序列号",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "merchantPrivateKeyPem",
        label: "商户私钥 PEM",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "仅保存在服务端，用于生成微信支付 API v3 请求签名。",
      },
      {
        key: "apiV3Key",
        label: "API v3 密钥",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "用于解密微信支付回调 resource，不会返回到前端。",
      },
      {
        key: "platformCertificatePem",
        label: "平台证书 PEM",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "用于验签微信支付回调；如使用平台公钥，可填写下方平台公钥 PEM。",
      },
      {
        key: "platformPublicKeyPem",
        label: "平台公钥 PEM",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        target: "configJson",
        placeholder: wechatPayDefaultApiBaseUrl,
        defaultValue: wechatPayDefaultApiBaseUrl,
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: paymentDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "alipay",
    helpText:
      "支付宝用于电脑网站和手机网站支付。真实调用开启前，测试连接只检查应用参数、公钥和私钥格式。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时仅创建站内待支付订单，不跳转真实支付宝网关，也不会提前发放权益。",
      },
      {
        key: "mode",
        label: "支付模式",
        target: "configJson",
        control: "select",
        options: alipayModeOptions,
        defaultValue: "page",
      },
      {
        key: "appId",
        label: "AppID",
        target: "configJson",
        placeholder: "支付宝开放平台应用 AppID",
      },
      {
        key: "notifyUrl",
        label: "异步通知地址",
        target: "configJson",
        placeholder: "https://example.com/billing/alipay/notify",
      },
      {
        key: "returnUrl",
        label: "同步返回地址",
        target: "configJson",
        placeholder: "https://example.com/billing/alipay/return",
      },
      {
        key: "appPrivateKeyPem",
        label: "应用私钥 PEM",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "仅用于服务端生成 RSA2 签名。",
      },
      {
        key: "alipayPublicKeyPem",
        label: "支付宝公钥 PEM",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "用于验签支付宝异步通知。",
      },
      {
        key: "gatewayUrl",
        label: "支付宝网关",
        target: "configJson",
        placeholder: alipayDefaultGatewayUrl,
        defaultValue: alipayDefaultGatewayUrl,
        advanced: true,
      },
      {
        key: "charset",
        label: "字符集",
        target: "configJson",
        defaultValue: "utf-8",
        advanced: true,
      },
      {
        key: "signType",
        label: "签名类型",
        target: "configJson",
        control: "select",
        options: alipaySignTypeOptions,
        defaultValue: "RSA2",
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: paymentDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "aliyun_smtp",
    helpText: "用于发送邮箱注册验证码。测试连接只做配置检查，不会发送真实邮件。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不发送真实邮件。",
      },
      {
        key: "host",
        label: "SMTP Host",
        target: "configJson",
        placeholder: "smtp.qiye.aliyun.com",
        helpText: "阿里云企业邮箱通常填写 smtp.qiye.aliyun.com。",
      },
      {
        key: "port",
        label: "SMTP 端口",
        target: "configJson",
        control: "number",
        defaultValue: 465,
        min: 1,
        max: 65535,
        step: 1,
        helpText: "SSL/TLS 通常使用 465；如果邮箱服务支持 STARTTLS，可使用 587。",
      },
      {
        key: "secure",
        label: "启用 SSL/TLS",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
      },
      {
        key: "fromName",
        label: "发件人名称",
        target: "configJson",
        defaultValue: "逐光天气",
      },
      {
        key: "fromAddress",
        label: "发件邮箱",
        target: "configJson",
        helpText: "通常应与 SMTP 用户名保持一致。",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "username",
        label: "SMTP 用户名",
        target: "secretJson",
        placeholder: "例如 support@domain.com；留空则保持现有密钥不变",
        helpText: "通常填写完整邮箱地址，例如 support@domain.com。",
        password: true,
      },
      {
        key: "password",
        label: "SMTP 密码 / 授权码",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        helpText: "填写邮箱密码或客户端授权码，不是阿里云 AccessKey。",
        password: true,
      },
    ],
  },
  {
    providerCode: "aliyun_sms",
    helpText: "用于发送手机注册验证码。测试连接只做配置检查，不会发送真实短信。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不发送真实短信。",
      },
      {
        key: "regionId",
        label: "Region ID",
        target: "configJson",
        defaultValue: "cn-hangzhou",
      },
      {
        key: "endpoint",
        label: "Endpoint",
        target: "configJson",
        placeholder: "留空则使用默认值：https://dysmsapi.aliyuncs.com",
        helpText: "正常管理员无需填写；留空时系统会使用默认阿里云短信地址。",
        advanced: true,
      },
      {
        key: "signName",
        label: "短信签名",
        target: "configJson",
      },
      {
        key: "templateCode",
        label: "模板 Code",
        target: "configJson",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "accessKeyId",
        label: "AccessKey ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "accessKeySecret",
        label: "AccessKey Secret",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "tencent_captcha",
    helpText:
      "腾讯云验证码用于登录、注册和账号绑定前的人机验证；前台只读取 CaptchaAppId 和 SDK 地址，不暴露服务端密钥。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "开启后服务端会调用腾讯云 DescribeCaptchaResult 校验 ticket 和 randstr。",
      },
      {
        key: "captchaAppId",
        label: "CaptchaAppId",
        target: "configJson",
        placeholder: "腾讯云验证码控制台中的 CaptchaAppId",
      },
      {
        key: "captchaType",
        label: "CaptchaType",
        target: "configJson",
        control: "number",
        defaultValue: tencentCaptchaDefaultCaptchaType,
        min: 9,
        max: 9,
        step: 1,
        advanced: true,
        helpText: "Web/App 验证码固定使用 9。",
      },
      {
        key: "sdkUrl",
        label: "前端 SDK 地址",
        target: "configJson",
        placeholder: tencentCaptchaDefaultSdkUrl,
        defaultValue: tencentCaptchaDefaultSdkUrl,
        advanced: true,
      },
      {
        key: "endpoint",
        label: "Endpoint",
        target: "configJson",
        placeholder: tencentCaptchaDefaultEndpoint,
        defaultValue: tencentCaptchaDefaultEndpoint,
        advanced: true,
      },
      {
        key: "region",
        label: "Region",
        target: "configJson",
        placeholder: "ap-guangzhou",
        defaultValue: "ap-guangzhou",
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: 1,
        min: 0,
        max: 3,
        step: 1,
        advanced: true,
      },
      {
        key: "enforceOnLogin",
        label: "登录启用验证",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
      },
      {
        key: "enforceOnRegisterSendCode",
        label: "注册发送验证码前启用验证",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
      },
      {
        key: "enforceOnRegisterConfirm",
        label: "注册确认前启用验证",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
      },
      {
        key: "enforceOnAccountBinding",
        label: "账号绑定启用验证",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
      },
      {
        key: "failOpenInDevelopment",
        label: "开发环境配置缺失时放行",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
        advanced: true,
      },
      {
        key: "failOpenInProduction",
        label: "生产环境配置缺失时放行",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        advanced: true,
      },
      {
        key: "secretId",
        label: "Secret ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "appSecretKey",
        label: "AppSecretKey",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "aliyun_oss",
    helpText:
      "用于报告、导出文件和生成素材的阿里云 OSS 存储后端；只有启用真实调用后才会请求云服务。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
      },
      { key: "region", label: "Region", target: "configJson" },
      { key: "endpoint", label: "Endpoint", target: "configJson" },
      { key: "bucket", label: "Bucket", target: "configJson" },
      {
        key: "basePrefix",
        label: "存储前缀",
        target: "configJson",
        defaultValue: "uploads",
      },
      {
        key: "publicBaseUrl",
        label: "公开访问地址",
        target: "configJson",
        placeholder: "https://cdn.example.com",
      },
      {
        key: "forcePathStyle",
        label: "Path-style 访问",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 120000,
        step: 100,
        advanced: true,
      },
      {
        key: "maxUploadBytes",
        label: "最大上传字节数",
        target: "configJson",
        control: "number",
        defaultValue: 10485760,
        min: 1,
        max: 104857600,
        step: 1024,
        advanced: true,
      },
      {
        key: "accessKeyId",
        label: "AccessKey ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "accessKeySecret",
        label: "AccessKey Secret",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "tencent_cos",
    helpText:
      "用于报告、导出文件和生成素材的腾讯云 COS 存储后端；只有启用真实调用后才会请求云服务。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
      },
      { key: "region", label: "Region", target: "configJson" },
      { key: "bucket", label: "Bucket", target: "configJson" },
      {
        key: "basePrefix",
        label: "存储前缀",
        target: "configJson",
        defaultValue: "uploads",
      },
      {
        key: "publicBaseUrl",
        label: "公开访问地址",
        target: "configJson",
        placeholder: "https://cdn.example.com",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 120000,
        step: 100,
        advanced: true,
      },
      {
        key: "maxUploadBytes",
        label: "最大上传字节数",
        target: "configJson",
        control: "number",
        defaultValue: 10485760,
        min: 1,
        max: 104857600,
        step: 1024,
        advanced: true,
      },
      {
        key: "secretId",
        label: "Secret ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "aliyun_cdn",
    helpText: "用于阿里云 CDN 域名缓存刷新和 URL 预热；测试连接默认只做配置检查。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时仅执行配置检查，不请求阿里云 CDN 服务。",
      },
      {
        key: "domains",
        label: "CDN 加速域名",
        target: "configJson",
        placeholder: "cdn.example.com, static.example.com",
        helpText: "多个域名可用逗号或换行分隔，刷新/预热默认只允许这些域名。",
      },
      {
        key: "endpoint",
        label: "Endpoint",
        target: "configJson",
        placeholder: "https://cdn.aliyuncs.com",
        defaultValue: "https://cdn.aliyuncs.com",
      },
      {
        key: "defaultRefreshType",
        label: "默认刷新类型",
        target: "configJson",
        control: "select",
        options: aliyunCdnRefreshTypeOptions,
        defaultValue: "file",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 120000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: 1,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
      {
        key: "rateLimitPerMinute",
        label: "每分钟操作限额",
        target: "configJson",
        control: "number",
        defaultValue: 60,
        min: 1,
        max: 1000,
        step: 1,
        advanced: true,
      },
      {
        key: "dryRun",
        label: "Dry Run",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
        advanced: true,
      },
      {
        key: "accessKeyId",
        label: "AccessKey ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "accessKeySecret",
        label: "AccessKey Secret",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "tencent_cdn",
    helpText: "用于腾讯云 CDN URL 刷新、路径刷新和 URL 预热；测试连接默认只做配置检查。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时仅执行配置检查，不请求腾讯云 CDN 服务。",
      },
      {
        key: "domains",
        label: "CDN 加速域名",
        target: "configJson",
        placeholder: "cdn.example.com, static.example.com",
        helpText: "多个域名可用逗号或换行分隔，刷新/预热默认只允许这些域名。",
      },
      {
        key: "endpoint",
        label: "Endpoint",
        target: "configJson",
        placeholder: "https://cdn.tencentcloudapi.com",
        defaultValue: "https://cdn.tencentcloudapi.com",
      },
      {
        key: "region",
        label: "Region",
        target: "configJson",
        placeholder: "ap-guangzhou",
      },
      {
        key: "defaultPurgeType",
        label: "默认刷新类型",
        target: "configJson",
        control: "select",
        options: tencentCdnPurgeTypeOptions,
        defaultValue: "url",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: 10000,
        min: 1000,
        max: 120000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: 1,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
      {
        key: "rateLimitPerMinute",
        label: "每分钟操作限额",
        target: "configJson",
        control: "number",
        defaultValue: 60,
        min: 1,
        max: 1000,
        step: 1,
        advanced: true,
      },
      {
        key: "dryRun",
        label: "Dry Run",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
        advanced: true,
      },
      {
        key: "secretId",
        label: "Secret ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
    ],
  },
  {
    providerCode: "s3_compatible",
    helpText: "用于后续 S3 兼容存储接入，当前不会在本地测试中触发真实上传。",
    fields: [
      {
        key: "accessKeyId",
        label: "Access Key ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretAccessKey",
        label: "Secret Access Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      { key: "bucket", label: "Bucket", target: "configJson" },
      { key: "region", label: "Region", target: "configJson" },
      { key: "endpoint", label: "Endpoint", target: "configJson" },
    ],
  },
  {
    providerCode: "local_storage",
    helpText: "用于本机服务器磁盘存储，适合单机部署和开发环境。",
    fields: [
      {
        key: "rootPath",
        label: "本地保存路径",
        target: "configJson",
        placeholder: "data/uploads",
      },
      {
        key: "publicBaseUrl",
        label: "公开访问地址",
        target: "configJson",
        placeholder: "https://example.com",
      },
      {
        key: "basePrefix",
        label: "存储前缀",
        target: "configJson",
        defaultValue: "uploads",
      },
      {
        key: "maxUploadBytes",
        label: "最大上传字节数",
        target: "configJson",
        control: "number",
        defaultValue: 10485760,
        min: 1,
        max: 104857600,
        step: 1024,
      },
    ],
  },
] as const satisfies readonly ProviderFieldPreset[];

export function getProviderFieldPreset(providerCode: string): ProviderFieldPreset | undefined {
  return providerFieldPresets.find((preset) => preset.providerCode === providerCode);
}
