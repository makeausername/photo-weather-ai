export const registerAuthTrustItems = [
  {
    title: "创建账户后保存查询历史",
    description: "成功登录后，最近分析和常用地点可在账户中心继续查看。",
  },
  {
    title: "统一管理订单与权益",
    description: "预测次数、订单状态和账户权益集中在一个清晰入口。",
  },
  {
    title: "安全邮箱或短信验证",
    description: "通过邮箱或手机号验证码完成注册，后续可继续维护绑定方式。",
  },
] as const;

export const registerAuthWorkflowItems = [
  { label: "注册方式", value: "邮箱或中国大陆手机号" },
  { label: "验证流程", value: "验证码确认后创建账户" },
  { label: "安全凭据", value: "密码至少 8 个字符" },
  { label: "登录跳转", value: "注册成功后回到登录页" },
] as const;
