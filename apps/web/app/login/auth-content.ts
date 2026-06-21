export const loginAuthTrustItems = [
  {
    title: "保存常用查询与历史记录",
    description: "登录后可回到最近分析过的地点和结果，减少重复输入。",
  },
  {
    title: "管理订单、权益和账户安全",
    description: "账户中心集中展示权益、绑定方式、密码和登录状态。",
  },
  {
    title: "按权限进入运营控制台",
    description: "管理员登录后从账户中心进入后台，不在公开页暴露管理功能。",
  },
] as const;

export const loginAuthWorkflowItems = [
  { label: "查询记录", value: "常用地点与结果统一保存" },
  { label: "权益管理", value: "订单状态和可用次数清晰可查" },
  { label: "安全设置", value: "邮箱、手机和密码集中维护" },
  { label: "后台入口", value: "仅对具备权限的账户显示" },
] as const;
