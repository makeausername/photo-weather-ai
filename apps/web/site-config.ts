export const siteConfig = {
  brand: {
    name: "逐光天气",
    tagline: "把天气预报翻译成风光摄影出行窗口",
    shortTagline: "风光摄影出行判断工具",
  },
  footer: {
    description: "为云海、朝霞晚霞、星空银河和风光出行提供天气窗口判断参考。",
    primaryNavigationTitle: "摄影判断",
    legalNavigationTitle: "帮助与规划",
    disclaimer: "结果仅供摄影出行参考，山地、夜间、恶劣天气请以官方预警和现场安全为准。",
    copyright: "© 2026 逐光天气",
    mainNavigation: [
      { href: "/#analysis", label: "综合判断" },
      { href: "/cloud-sea", label: "云海" },
      { href: "/glow", label: "朝霞晚霞" },
      { href: "/astro", label: "星空银河" },
      { href: "/spots", label: "机位库" },
      { href: "/pricing", label: "定价" },
    ],
    legalNavigation: [
      { href: "/help", label: "帮助与联系" },
      { href: "/privacy", label: "隐私政策" },
      { href: "/terms", label: "服务条款" },
      { href: "/disclaimer", label: "免责声明" },
    ],
  },
  legal: {
    icpNumber: "沪ICP备2025140939号-3",
    icpUrl: "https://beian.miit.gov.cn",
  },
} as const;
