"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Table,
  Textarea,
} from "../../../components/ui";
import {
  entitlementTypeDisplayName,
  ledgerReasonDisplayName,
  maskEmail,
  maskPhone,
  maskProviderTradeNo,
  paymentProviderDisplayName,
  productDisplayName,
  safeDisplayNameFromUser,
} from "../../../components/display-labels";
import {
  cancelAdminOrder,
  closeAdminOrder,
  fetchAdminOrderDetail,
  markAdminOrderPaid,
  updateAdminOrder,
  type AdminOrderTimelineItem,
  type AdminPaymentOrderDetail,
} from "../admin-api";

type PendingAction = "mark-paid" | "cancel" | "close" | null;

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

function canSimpleOperate(detail: AdminPaymentOrderDetail): boolean {
  return detail.order.status === "created" || detail.order.status === "pending";
}

function timelineDescription(item: AdminOrderTimelineItem): string | null {
  if (!item.description) {
    return null;
  }
  if (item.type === "created") {
    return productDisplayName(item.description);
  }
  if (item.type === "notification" || item.type === "paid") {
    return maskProviderTradeNo(item.description);
  }
  return item.description;
}

function InfoItem({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

export function AdminOrderDetailClient({ orderNo }: { readonly orderNo: string }) {
  const [detail, setDetail] = useState<AdminPaymentOrderDetail | null>(null);
  const [status, setStatus] = useState("正在加载订单详情...");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [adminNote, setAdminNote] = useState("");

  async function loadOrder() {
    try {
      const next = await fetchAdminOrderDetail(orderNo);
      setDetail(next);
      setAdminNote(next.order.adminNote ?? "");
      setStatus("订单详情已加载。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderNo]);

  async function saveNote() {
    try {
      const next = await updateAdminOrder(orderNo, { adminNote });
      setDetail(next);
      setStatus("订单备注已保存。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }
    try {
      if (pendingAction === "mark-paid") {
        const result = await markAdminOrderPaid(orderNo);
        setDetail(result.order);
        setStatus(
          result.entitlementGranted ? "订单已手动标记支付并发放权益。" : "订单已是支付完成状态。",
        );
      }
      if (pendingAction === "cancel") {
        setDetail(await cancelAdminOrder(orderNo));
        setStatus("订单已取消。");
      }
      if (pendingAction === "close") {
        setDetail(await closeAdminOrder(orderNo));
        setStatus("订单已关闭。");
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  if (!detail) {
    return (
      <Card>
        <EmptyState title="正在加载订单详情" description={status} />
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="grid gap-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-all text-2xl font-bold text-foreground">
                  {detail.order.orderNo}
                </h2>
                {statusBadge(detail.order.status)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {paymentProviderDisplayName(detail.order.provider)} /{" "}
                {productDisplayName(detail.order.productCode)}
              </p>
            </div>
            <Badge variant="info">{status}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoItem label="金额" value={formatMoney(detail.order.amountCents)} />
            <InfoItem label="币种" value={detail.order.currency} />
            <InfoItem label="支付流水" value={maskProviderTradeNo(detail.order.providerTradeNo)} />
            <InfoItem
              label="权益发放"
              value={detail.order.entitlementGrantedAt ? "已发放" : "未发放"}
            />
            <InfoItem label="支付时间" value={formatDate(detail.order.paidAt)} />
            <InfoItem label="过期时间" value={formatDate(detail.order.expiresAt)} />
            <InfoItem label="创建时间" value={formatDate(detail.order.createdAt)} />
            <InfoItem label="更新时间" value={formatDate(detail.order.updatedAt)} />
          </div>
        </Card>

        <Card className="grid gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold">安全操作</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              手动标记支付仅用于允许人工处理的环境；已支付订单不能取消或关闭。
            </p>
          </div>
          {canSimpleOperate(detail) ? (
            <div className="grid gap-2">
              <Button variant="success" onClick={() => setPendingAction("mark-paid")}>
                手动标记支付
              </Button>
              <Button variant="secondary" onClick={() => setPendingAction("cancel")}>
                取消订单
              </Button>
              <Button variant="secondary" onClick={() => setPendingAction("close")}>
                关闭订单
              </Button>
            </div>
          ) : (
            <Badge variant="muted" className="w-fit">
              当前状态不支持简单操作
            </Badge>
          )}
          <FormField label="管理员备注">
            <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
          </FormField>
          <Button variant="secondary" onClick={saveNote}>
            保存备注
          </Button>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-4 p-5">
          <h2 className="text-lg font-bold">用户信息</h2>
          {detail.user ? (
            <div className="grid gap-2 text-sm">
              <Link
                className="font-semibold text-primary"
                href={`/admin/users/${encodeURIComponent(detail.user.id)}`}
              >
                {safeDisplayNameFromUser(detail.user)}
              </Link>
              <p className="text-muted-foreground">
                {maskEmail(detail.user.email) ?? "-"} / {maskPhone(detail.user.phone) ?? "-"}
              </p>
              <p className="text-muted-foreground">状态：{detail.user.status}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">订单用户记录不可用。</p>
          )}
        </Card>
        <Card className="grid gap-4 p-5">
          <h2 className="text-lg font-bold">产品信息</h2>
          {detail.product ? (
            <div className="grid gap-2 text-sm">
              <p className="font-semibold">{detail.product.name}</p>
              {detail.product.description ? (
                <p className="text-muted-foreground">{detail.product.description}</p>
              ) : null}
              <p className="text-muted-foreground">
                {formatMoney(detail.product.amountCents)} / {detail.product.credits} 次额度
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">产品记录不可用。</p>
          )}
        </Card>
      </div>

      <Card className="grid gap-4 p-5">
        <h2 className="text-lg font-bold">支付时间线</h2>
        <div className="grid gap-3">
          {detail.timeline.map((item, index) => (
            <div
              key={`${item.type}-${item.at}-${index}`}
              className="grid gap-1 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{item.title}</p>
                <Badge variant="muted">{item.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(item.at)}</p>
              {timelineDescription(item) ? (
                <p className="text-sm text-card-foreground">{timelineDescription(item)}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Table aria-label="支付通知">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">渠道</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">验签</th>
              <th className="px-3 py-2.5">流水号</th>
              <th className="px-3 py-2.5">处理时间</th>
              <th className="px-3 py-2.5">错误</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.notifications.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5">{paymentProviderDisplayName(item.provider)}</td>
                <td className="px-3 py-2.5">{item.status}</td>
                <td className="px-3 py-2.5">{item.signatureVerified ? "通过" : "未通过"}</td>
                <td className="px-3 py-2.5">{maskProviderTradeNo(item.providerTradeNo)}</td>
                <td className="px-3 py-2.5">{formatDate(item.processedAt)}</td>
                <td className="max-w-md break-words px-3 py-2.5">{item.errorMessage ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Table aria-label="订单权益">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">类型</th>
              <th className="px-3 py-2.5">数量</th>
              <th className="px-3 py-2.5">剩余</th>
              <th className="px-3 py-2.5">发放时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.entitlements.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5">{entitlementTypeDisplayName(item.type)}</td>
                <td className="px-3 py-2.5">{item.quantity}</td>
                <td className="px-3 py-2.5">{item.remainingQuantity ?? "-"}</td>
                <td className="px-3 py-2.5">{formatDate(item.grantedAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Table aria-label="订单积分流水">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">变化</th>
              <th className="px-3 py-2.5">余额</th>
              <th className="px-3 py-2.5">原因</th>
              <th className="px-3 py-2.5">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.creditLedger.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5">{item.delta}</td>
                <td className="px-3 py-2.5">{item.balanceAfter}</td>
                <td className="px-3 py-2.5">{ledgerReasonDisplayName(item.reason)}</td>
                <td className="px-3 py-2.5">{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Table aria-label="订单审计日志">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">时间</th>
              <th className="px-3 py-2.5">操作</th>
              <th className="px-3 py-2.5">对象</th>
              <th className="px-3 py-2.5">操作者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2.5">{formatDate(log.createdAt)}</td>
                <td className="px-3 py-2.5">{log.actionLabel}</td>
                <td className="px-3 py-2.5">
                  <div className="grid gap-0.5">
                    <span className="font-medium text-foreground">{log.targetLabel}</span>
                    <span className="text-xs text-muted-foreground">{log.targetSummary}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">{log.actorLabel}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction === "mark-paid"
            ? "确认手动标记支付"
            : pendingAction === "cancel"
              ? "确认取消订单"
              : "确认关闭订单"
        }
        description={
          <span>
            订单 {detail.order.orderNo}
            {pendingAction === "mark-paid"
              ? " 会按人工操作完成支付并尝试发放权益。"
              : " 将进入最终状态，不能通过简单操作恢复。"}
          </span>
        }
        confirmLabel="确认"
        cancelLabel="取消"
        confirmVariant={pendingAction === "mark-paid" ? "success" : "danger"}
        onConfirm={runPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
