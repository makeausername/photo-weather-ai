export const loginAuthIntroItems = [
  {
    title: "最近看过的地点更容易找回",
    description: "登录后，可以回到之前分析过的地点和结果，不必每次从头输入。",
  },
  {
    title: "订单和可用次数放在一起",
    description: "购买记录、剩余次数、邮箱和手机号都可以在账户中心查看。",
  },
  {
    title: "有权限时显示后台入口",
    description: "管理员登录后，会在账户中心看到后台入口；普通账户不会显示。",
  },
] as const;

export const loginAuthPanelNote = {
  title: "登录后可以做什么",
  description: "查看历史分析、订单和账户设置；如果账户有管理员权限，也从这里进入后台。",
} as const;
