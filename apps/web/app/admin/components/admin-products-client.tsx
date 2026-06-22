"use client";

import { useEffect, useMemo, useState } from "react";
import { listAdminProducts, updateAdminProduct, type AdminBillingProduct } from "../admin-api";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  SwitchRow,
  Table,
  Textarea,
  cn,
} from "../../../components/ui";
import { getAdaptiveGridClassName, getAdaptiveGridItemClassName } from "./admin-adaptive-grid";

type LoadState = "loading" | "ready" | "saving" | "error";

const standardPublicCodes = new Set(["monthly_full", "quarterly_full", "yearly_full"]);

type ProductDraft = {
  readonly name: string;
  readonly description: string;
  readonly amountYuan: string;
  readonly enabled: boolean;
  readonly sortOrder: string;
  readonly publicVisible: boolean;
  readonly publicPurchasable: boolean;
  readonly recommended: boolean;
  readonly badgeText: string;
  readonly featureBulletsText: string;
};

export function AdminProductsClient({
  initialProducts,
}: {
  readonly initialProducts?: readonly AdminBillingProduct[];
}) {
  const [products, setProducts] = useState<readonly AdminBillingProduct[]>(initialProducts ?? []);
  const [selectedCode, setSelectedCode] = useState(initialProducts?.[0]?.code ?? "");
  const [draft, setDraft] = useState<ProductDraft | null>(
    initialProducts?.[0] ? draftFromProduct(initialProducts[0]) : null,
  );
  const [state, setState] = useState<LoadState>(initialProducts ? "ready" : "loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialProducts) {
      return;
    }
    let cancelled = false;
    listAdminProducts()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setProducts(items);
        setSelectedCode((current) => current || items[0]?.code || "");
        setDraft(items[0] ? draftFromProduct(items[0]) : null);
        setState("ready");
        setMessage("");
      })
      .catch((error) => {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "套餐配置加载失败。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialProducts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedCode) ?? products[0] ?? null,
    [products, selectedCode],
  );
  const summary = useMemo(() => summarizeProducts(products), [products]);
  const metricCount = 4;
  const useProductSidePanel = products.length > 1;

  function selectProduct(product: AdminBillingProduct) {
    setSelectedCode(product.code);
    setDraft(draftFromProduct(product));
    setMessage("");
    setState("ready");
  }

  async function handleSave() {
    if (!selectedProduct || !draft) {
      return;
    }
    const amountCents = Math.round(Number(draft.amountYuan) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setState("error");
      setMessage("价格必须是有效的非负金额。");
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setState("error");
      setMessage("排序值必须是非负整数。");
      return;
    }

    setState("saving");
    setMessage("");
    try {
      const updated = await updateAdminProduct(selectedProduct.code, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        amountCents,
        currency: "CNY",
        enabled: draft.enabled,
        sortOrder,
        publicVisible: draft.publicVisible,
        publicPurchasable:
          selectedProduct.code === "trial_7_days" ? false : draft.publicPurchasable,
        recommended: draft.recommended,
        badgeText: draft.badgeText.trim() || null,
        featureBullets: draft.featureBulletsText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setProducts((current) =>
        current.map((product) => (product.code === updated.code ? updated : product)),
      );
      setDraft(draftFromProduct(updated));
      setState("ready");
      setMessage("套餐定价已保存。");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "套餐定价保存失败。");
    }
  }

  return (
    <div className="grid gap-5" data-admin-products="pricing-management">
      {message ? (
        <p
          role={state === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            state === "error" ? "border-danger text-danger" : "border-success text-success",
          )}
        >
          {message}
        </p>
      ) : null}

      <section
        className={getAdaptiveGridClassName(metricCount, {
          variant: "metric",
          allowFourMetricColumns: true,
        })}
      >
        <MetricCard
          className={getAdaptiveGridItemClassName(metricCount, 0, { variant: "metric" })}
          label="上架套餐数"
          value={`${summary.enabledCount}`}
        />
        <MetricCard
          className={getAdaptiveGridItemClassName(metricCount, 1, { variant: "metric" })}
          label="可购买套餐数"
          value={`${summary.purchasableCount}`}
        />
        <MetricCard
          className={getAdaptiveGridItemClassName(metricCount, 2, { variant: "metric" })}
          label="最高价套餐"
          value={summary.highestPriceText}
        />
        <MetricCard
          className={getAdaptiveGridItemClassName(metricCount, 3, { variant: "metric" })}
          label="试用状态"
          value={summary.trialText}
        />
      </section>

      <section
        className={cn(
          "grid gap-5 xl:items-start",
          useProductSidePanel && "xl:grid-cols-[minmax(0,1fr)_390px]",
        )}
        data-admin-product-layout={useProductSidePanel ? "side-edit" : "stacked-edit"}
      >
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-card-foreground">套餐列表</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                公开定价、购买状态和权益时长由后台产品配置统一控制。
              </p>
            </div>
            <Badge variant="muted">套餐配置</Badge>
          </div>

          {state === "loading" ? (
            <p className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              正在读取套餐配置...
            </p>
          ) : null}

          <Table>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">套餐名称</th>
                <th className="px-3 py-2">价格</th>
                <th className="px-3 py-2">时长</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">公开</th>
                <th className="px-3 py-2">推荐/角标</th>
                <th className="px-3 py-2">排序</th>
                <th className="px-3 py-2">更新</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <tr key={product.code} className="align-top">
                  <td className="px-3 py-3 font-semibold text-card-foreground">{product.name}</td>
                  <td className="px-3 py-3">{formatPrice(product.amountCents)}</td>
                  <td className="px-3 py-3">{formatDuration(product.durationDays)}</td>
                  <td className="px-3 py-3">
                    <Badge variant={product.enabled ? "success" : "muted"}>
                      {product.enabled ? "已启用" : "已停用"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={product.publicVisible ? "info" : "muted"}>
                        {product.publicVisible ? "可见" : "隐藏"}
                      </Badge>
                      <Badge variant={product.publicPurchasable ? "success" : "muted"}>
                        {product.publicPurchasable ? "可购买" : "不可购买"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {product.recommended ? <Badge variant="accent">推荐</Badge> : null}
                      {product.badgeText ? <Badge variant="info">{product.badgeText}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">{product.sortOrder}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDateTime(product.updatedAt)}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedProduct?.code === product.code ? "primary" : "secondary"}
                      onClick={() => selectProduct(product)}
                    >
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <EditPanel
          product={selectedProduct}
          draft={draft}
          saving={state === "saving"}
          onDraftChange={setDraft}
          onSave={() => void handleSave()}
        />
      </section>
    </div>
  );
}

function EditPanel({
  product,
  draft,
  saving,
  onDraftChange,
  onSave,
}: {
  readonly product: AdminBillingProduct | null;
  readonly draft: ProductDraft | null;
  readonly saving: boolean;
  readonly onDraftChange: (draft: ProductDraft) => void;
  readonly onSave: () => void;
}) {
  if (!product || !draft) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">请选择一个套餐进行编辑。</p>
      </Card>
    );
  }

  const trial = product.code === "trial_7_days";
  const standard = standardPublicCodes.has(product.code);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">编辑套餐</h2>
          <p className="mt-1 text-xs text-muted-foreground">{product.name}</p>
        </div>
        <Badge variant={trial ? "warning" : standard ? "success" : "muted"}>
          {trial ? "内部试用" : standard ? "公开套餐" : "历史产品"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3">
        <FormField label="名称">
          <Input
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
          />
        </FormField>
        <FormField label="描述">
          <Textarea
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
          />
        </FormField>
        <div className={getAdaptiveGridClassName(2, { breakpoint: "sm" })}>
          <FormField label="价格（元）" hint={trial ? "试用套餐固定为 0 元。" : undefined}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.amountYuan}
              disabled={trial}
              onChange={(event) => onDraftChange({ ...draft, amountYuan: event.target.value })}
            />
          </FormField>
          <FormField label="权益时长">
            <Input value={formatDuration(product.durationDays)} disabled />
          </FormField>
        </div>
        <div className={getAdaptiveGridClassName(2, { breakpoint: "sm" })}>
          <FormField label="排序">
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.sortOrder}
              onChange={(event) => onDraftChange({ ...draft, sortOrder: event.target.value })}
            />
          </FormField>
          <FormField label="角标">
            <Input
              value={draft.badgeText}
              onChange={(event) => onDraftChange({ ...draft, badgeText: event.target.value })}
            />
          </FormField>
        </div>

        <SwitchRow
          label="启用套餐"
          checked={draft.enabled}
          onChange={(enabled) => onDraftChange({ ...draft, enabled })}
        />
        <SwitchRow
          label="公开可见"
          description="控制公开定价页是否展示该套餐信息。"
          checked={draft.publicVisible}
          onChange={(publicVisible) => onDraftChange({ ...draft, publicVisible })}
        />
        <SwitchRow
          label="公开可购买"
          description={trial ? "试用套餐不能开放购买。" : "关闭后新订单不能购买该套餐。"}
          checked={trial ? false : draft.publicPurchasable}
          disabled={trial}
          onChange={(publicPurchasable) => onDraftChange({ ...draft, publicPurchasable })}
        />
        <SwitchRow
          label="推荐套餐"
          checked={draft.recommended}
          onChange={(recommended) => onDraftChange({ ...draft, recommended })}
        />

        <FormField label="功能要点" hint="每行一个要点，公开页会按顺序展示。">
          <Textarea
            value={draft.featureBulletsText}
            onChange={(event) =>
              onDraftChange({ ...draft, featureBulletsText: event.target.value })
            }
          />
        </FormField>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => onDraftChange(draftFromProduct(product))}
          >
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? "保存中..." : "保存定价"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-card-foreground">{value}</p>
    </Card>
  );
}

function draftFromProduct(product: AdminBillingProduct): ProductDraft {
  return {
    name: product.name,
    description: product.description ?? "",
    amountYuan: (product.amountCents / 100).toFixed(2),
    enabled: product.enabled,
    sortOrder: String(product.sortOrder),
    publicVisible: product.publicVisible,
    publicPurchasable: product.publicPurchasable,
    recommended: product.recommended,
    badgeText: product.badgeText ?? "",
    featureBulletsText: product.featureBullets.join("\n"),
  };
}

function summarizeProducts(products: readonly AdminBillingProduct[]) {
  const enabledCount = products.filter((product) => product.enabled).length;
  const purchasableCount = products.filter(
    (product) => product.enabled && product.publicPurchasable,
  ).length;
  const highest = products
    .filter((product) => product.amountCents > 0)
    .sort((left, right) => right.amountCents - left.amountCents)[0];
  const trial = products.find((product) => product.code === "trial_7_days");
  return {
    enabledCount,
    purchasableCount,
    highestPriceText: highest ? `${highest.name} ${formatPrice(highest.amountCents)}` : "0 元",
    trialText: trial?.enabled ? "内部开启" : "内部关闭",
  };
}

function formatPrice(amountCents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatDuration(durationDays: number | null): string {
  return durationDays ? `${durationDays} 天` : "一次性";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
