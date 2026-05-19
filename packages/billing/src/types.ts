export type BillingProviderId = "mock" | "wechat_pay" | "alipay" | "manual";

export type BillingPlan = {
  readonly id: string;
  readonly name: string;
  readonly monthlyQuota: number;
  readonly priceCents: number;
  readonly currency: "CNY";
};

export type QuotaSnapshot = {
  readonly accountId: string;
  readonly planId: string;
  readonly used: number;
  readonly remaining: number;
  readonly resetsAt: string;
};

export type BillingProvider = {
  readonly id: BillingProviderId;
  getQuota(accountId: string): Promise<QuotaSnapshot>;
};
