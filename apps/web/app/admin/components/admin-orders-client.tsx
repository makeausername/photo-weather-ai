"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Select,
  Table,
  cn,
} from "../../../components/ui";
import {
  paymentProviderDisplayName,
  productDisplayName,
  safeDisplayNameFromUser,
} from "../../../components/display-labels";
import {
  cancelAdminOrder,
  closeAdminOrder,
  fetchAdminOrders,
  markAdminOrderPaid,
  type AdminPaymentOrderListItem,
  type AdminPaymentOrderListResponse,
} from "../admin-api";
import { getAdaptiveGridClassName, getAdaptiveGridItemClassName } from "./admin-adaptive-grid";

type PendingAction =
  | { readonly kind: "mark-paid"; readonly order: AdminPaymentOrderListItem }
  | { readonly kind: "cancel"; readonly order: AdminPaymentOrderListItem }
  | { readonly kind: "close"; readonly order: AdminPaymentOrderListItem };

const initialResponse: AdminPaymentOrderListResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  },
  summary: {
    totalOrders: 0,
    paidOrders: 0,
    unpaidOrders: 0,
    failedOrCanceledOrders: 0,
    totalRevenueCents: 0,
    todayRevenueCents: 0,
  },
};

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

function formatMoney(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function statusBadge(status: string) {
  const variant =
    status === "paid"
      ? "success"
      : status === "pending" || status === "created"
        ? "warning"
        : status === "failed" || status === "canceled"
          ? "danger"
          : "muted";
  return <Badge variant={variant}>{status}</Badge>;
}

function canSimpleOperate(order: AdminPaymentOrderListItem): boolean {
  return order.status === "created" || order.status === "pending";
}

function summaryCards(response: AdminPaymentOrderListResponse) {
  return [
    { title: "订单总数", value: response.summary.totalOrders },
    { title: "已支付", value: response.summary.paidOrders },
    { title: "待支付", value: response.summary.unpaidOrders },
    { title: "失败/取消", value: response.summary.failedOrCanceledOrders },
    { title: "总收入", value: formatMoney(response.summary.totalRevenueCents) },
    { title: "今日收入", value: formatMoney(response.summary.todayRevenueCents) },
  ];
}

export function AdminOrdersClient() {
  const [response, setResponse] = useState<AdminPaymentOrderListResponse>(initialResponse);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("正在加载订单...");
  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    provider: "all",
    productCode: "",
    paid: "",
    createdFrom: "",
    createdTo: "",
  });
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const query = useMemo(
    () => ({
      q: filters.q,
      status: filters.status,
      provider: filters.provider,
      productCode: filters.productCode,
      paid: filters.paid,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      pageSize: 20,
    }),
    [filters],
  );

  async function loadOrders() {
    setLoading(true);
    try {
      const next = await fetchAdminOrders(query);
      setResponse(next);
      setStatus(`已加载 ${next.pagination.total} 个订单。`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [query]);

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }
    try {
      if (pendingAction.kind === "mark-paid") {
        const result = await markAdminOrderPaid(pendingAction.order.orderNo);
        setStatus(
          result.entitlementGranted ? "订单已手动标记支付并发放权益。" : "订单已是支付完成状态。",
        );
      }
      if (pendingAction.kind === "cancel") {
        await cancelAdminOrder(pendingAction.order.orderNo);
        setStatus("订单已取消。");
      }
      if (pendingAction.kind === "close") {
        await closeAdminOrder(pendingAction.order.orderNo);
        setStatus("订单已关闭。");
      }
      setPendingAction(null);
      await loadOrders();
    } catch (error) {
      setStatus((error as Error).message);
      setPendingAction(null);
    }
  }

  const summaryCardItems = summaryCards(response);
  const filterFieldCount = 6;

  return (
    <div className="grid gap-5">
      <div
        className={getAdaptiveGridClassName(summaryCardItems.length, {
          variant: "metric",
          allowThreeMetricColumns: true,
        })}
      >
        {summaryCardItems.map((card, index) => (
          <Card
            key={card.title}
            className={cn(
              getAdaptiveGridItemClassName(summaryCardItems.length, index, {
                variant: "metric",
                allowThreeMetricColumns: true,
              }),
              "grid gap-2 p-4",
            )}
          >
            <p className="text-xs font-semibold text-muted-foreground">{card.title}</p>
            <p className="text-2xl font-bold text-foreground">{loading ? "--" : card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="grid gap-4 p-4">
        <div className={getAdaptiveGridClassName(filterFieldCount, { variant: "form" })}>
          <FormField label="搜索">
            <Input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="订单号、流水号或用户"
            />
          </FormField>
          <FormField label="状态">
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="all">全部</option>
              <option value="created">已创建</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="closed">已关闭</option>
              <option value="canceled">已取消</option>
              <option value="failed">失败</option>
              <option value="refunded">已退款</option>
            </Select>
          </FormField>
          <FormField label="支付渠道">
            <Select
              value={filters.provider}
              onChange={(event) =>
                setFilters((current) => ({ ...current, provider: event.target.value }))
              }
            >
              <option value="all">全部</option>
              <option value="wechat_pay">微信支付</option>
              <option value="alipay">支付宝</option>
              <option value="mock">Mock</option>
            </Select>
          </FormField>
          <FormField label="产品">
            <Input
              value={filters.productCode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, productCode: event.target.value }))
              }
              placeholder="月卡 / 季卡 / 年卡"
            />
          </FormField>
          <FormField label="支付状态">
            <Select
              value={filters.paid}
              onChange={(event) =>
                setFilters((current) => ({ ...current, paid: event.target.value }))
              }
            >
              <option value="">全部</option>
              <option value="true">已支付</option>
              <option value="false">未支付</option>
            </Select>
          </FormField>
          <FormField label="创建日期">
            <Input
              type="date"
              value={filters.createdFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, createdFrom: event.target.value }))
              }
            />
          </FormField>
        </div>
        <Badge variant={loading ? "muted" : "info"} className="w-fit">
          {status}
        </Badge>
      </Card>

      {response.items.length > 0 ? (
        <Table aria-label="订单管理列表">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">订单号</th>
              <th className="px-3 py-2.5">用户</th>
              <th className="px-3 py-2.5">产品</th>
              <th className="px-3 py-2.5">渠道</th>
              <th className="px-3 py-2.5">金额</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">支付时间</th>
              <th className="px-3 py-2.5">创建时间</th>
              <th className="px-3 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {response.items.map((order) => (
              <tr key={order.orderNo}>
                <td className="px-3 py-2.5">
                  <Link
                    className="break-all font-semibold text-primary"
                    href={`/admin/orders/${encodeURIComponent(order.orderNo)}`}
                  >
                    {order.orderNo}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  {order.user ? (
                    <Link
                      className="font-semibold text-foreground"
                      href={`/admin/users/${encodeURIComponent(order.user.id)}`}
                    >
                      {safeDisplayNameFromUser(order.user)}
                    </Link>
                  ) : (
                    "未知用户"
                  )}
                </td>
                <td className="px-3 py-2.5">{productDisplayName(order.productCode)}</td>
                <td className="px-3 py-2.5">{paymentProviderDisplayName(order.provider)}</td>
                <td className="px-3 py-2.5 font-semibold">{formatMoney(order.amountCents)}</td>
                <td className="px-3 py-2.5">{statusBadge(order.status)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{formatDate(order.paidAt)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{formatDate(order.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/admin/orders/${encodeURIComponent(order.orderNo)}`}
                      className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-semibold hover:border-primary"
                    >
                      查看详情
                    </Link>
                    {canSimpleOperate(order) ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPendingAction({ kind: "mark-paid", order })}
                        >
                          手动标记支付
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingAction({ kind: "cancel", order })}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingAction({ kind: "close", order })}
                        >
                          关闭
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          title={loading ? "正在加载订单" : "没有匹配订单"}
          description="调整搜索、状态、渠道、产品或日期筛选后可继续查看订单。"
        />
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === "mark-paid"
            ? "确认手动标记支付"
            : pendingAction?.kind === "cancel"
              ? "确认取消订单"
              : "确认关闭订单"
        }
        description={
          <span>
            订单 {pendingAction?.order.orderNo}
            {pendingAction?.kind === "mark-paid"
              ? " 会按人工操作完成支付并尝试发放权益。"
              : " 将进入最终状态，不能通过简单操作恢复。"}
          </span>
        }
        confirmLabel="确认"
        cancelLabel="取消"
        confirmVariant={pendingAction?.kind === "mark-paid" ? "success" : "danger"}
        onConfirm={runPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
