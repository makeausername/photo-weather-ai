import {
  fullForecastAccessEntitlementType,
  isFullForecastAccessProduct,
  isInternalTrialProduct,
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  trialFullAccessProductCode,
  yearlyFullAccessProductCode,
} from "./access.js";
import { createAuditLog } from "./audit.js";
import { getPrismaClient } from "./client.js";
import { cloneJsonValue, isPlainJsonObject } from "./json.js";
import type { BillingProductRecord, DatabaseClient, JsonValue } from "./types.js";

const publicFullAccessProductCodes = new Set<string>([
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  yearlyFullAccessProductCode,
]);

export type SafeBillingProductMetadata = {
  readonly internal?: boolean;
  readonly source?: string;
  readonly plan?: string;
  readonly grantType?: string;
};

export type PublicBillingProduct = {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly priceText: string;
  readonly durationDays: number | null;
  readonly durationText: string;
  readonly recommended: boolean;
  readonly badgeText: string | null;
  readonly featureBullets: readonly string[];
  readonly sortOrder: number;
};

export type AdminBillingProduct = {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly durationDays: number | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly publicVisible: boolean;
  readonly publicPurchasable: boolean;
  readonly recommended: boolean;
  readonly badgeText: string | null;
  readonly featureBullets: readonly string[];
  readonly metadataJson: SafeBillingProductMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UpdateAdminBillingProductInput = {
  readonly code: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly amountCents?: number;
  readonly currency?: string;
  readonly enabled?: boolean;
  readonly sortOrder?: number;
  readonly publicVisible?: boolean;
  readonly publicPurchasable?: boolean;
  readonly recommended?: boolean;
  readonly badgeText?: string | null;
  readonly featureBullets?: readonly string[];
  readonly publicDescription?: string | null;
  readonly shortDescription?: string | null;
  readonly actorUserId?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
};

export class BillingProductNotFoundError extends Error {
  constructor(readonly code: string) {
    super(`Billing product not found: ${code}`);
  }
}

export class InvalidBillingProductUpdateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

async function withTransaction<TResult>(
  client: DatabaseClient,
  operation: (transactionClient: DatabaseClient) => Promise<TResult>,
): Promise<TResult> {
  if (typeof client.$transaction === "function") {
    return client.$transaction(operation);
  }

  return operation(client);
}

function requireDelegate<TDelegate>(
  delegate: TDelegate | undefined,
  name: string,
): TDelegate {
  if (!delegate) {
    throw new Error(`Database client is missing ${name} delegate.`);
  }
  return delegate;
}

function normalizeBillingProduct(record: any): BillingProductRecord {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    amountCents: record.amountCents,
    currency: record.currency,
    credits: record.credits,
    durationDays: record.durationDays ?? null,
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    metadataJson: record.metadataJson ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function metadataOf(product: BillingProductRecord): Record<string, JsonValue> {
  return isPlainJsonObject(product.metadataJson) ? product.metadataJson : {};
}

function compactJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function readStringMetadata(product: BillingProductRecord, key: string): string | null {
  const value = metadataOf(product)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanMetadata(product: BillingProductRecord, key: string): boolean | null {
  const value = metadataOf(product)[key];
  return typeof value === "boolean" ? value : null;
}

function readStringListMetadata(product: BillingProductRecord, key: string): readonly string[] {
  const value = metadataOf(product)[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicVisible(product: BillingProductRecord): boolean {
  if (isInternalTrialProduct(product)) {
    return readBooleanMetadata(product, "publicVisible") === true;
  }
  return (
    readBooleanMetadata(product, "publicVisible") ??
    readBooleanMetadata(product, "public") ??
    false
  );
}

function publicPurchasable(product: BillingProductRecord): boolean {
  if (product.code === trialFullAccessProductCode || isInternalTrialProduct(product)) {
    return false;
  }
  return (
    readBooleanMetadata(product, "publicPurchasable") ??
    readBooleanMetadata(product, "public") ??
    false
  );
}

function recommended(product: BillingProductRecord): boolean {
  return readBooleanMetadata(product, "recommended") ?? false;
}

function badgeText(product: BillingProductRecord): string | null {
  return readStringMetadata(product, "badgeText") ?? readStringMetadata(product, "badge");
}

function descriptionForPublic(product: BillingProductRecord): string | null {
  return readStringMetadata(product, "publicDescription") ?? product.description;
}

function safeMetadata(product: BillingProductRecord): SafeBillingProductMetadata {
  const metadata = metadataOf(product);
  return {
    ...(typeof metadata.internal === "boolean" ? { internal: metadata.internal } : {}),
    ...(typeof metadata.source === "string" ? { source: metadata.source } : {}),
    ...(typeof metadata.plan === "string" ? { plan: metadata.plan } : {}),
    ...(typeof metadata.grantType === "string" ? { grantType: metadata.grantType } : {}),
  };
}

export function billingProductAdminSnapshot(product: BillingProductRecord): JsonValue {
  return compactJson({
    code: product.code,
    name: product.name,
    description: product.description,
    amountCents: product.amountCents,
    currency: product.currency,
    durationDays: product.durationDays,
    enabled: product.enabled,
    sortOrder: product.sortOrder,
    publicVisible: publicVisible(product),
    publicPurchasable: publicPurchasable(product),
    recommended: recommended(product),
    badgeText: badgeText(product),
    featureBullets: readStringListMetadata(product, "featureBullets"),
    metadataJson: safeMetadata(product),
  });
}

export function formatBillingProductPriceText(product: Pick<BillingProductRecord, "amountCents" | "currency">): string {
  if (product.currency !== "CNY") {
    return `${product.amountCents / 100} ${product.currency}`;
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(product.amountCents / 100);
}

export function formatBillingProductDurationText(
  product: Pick<BillingProductRecord, "durationDays">,
): string {
  if (!product.durationDays || product.durationDays <= 0) {
    return "一次性权益";
  }
  if (product.durationDays === 7) {
    return "7 天";
  }
  if (product.durationDays === 30) {
    return "30 天";
  }
  if (product.durationDays === 90) {
    return "90 天";
  }
  if (product.durationDays === 365) {
    return "365 天";
  }
  return `${product.durationDays} 天`;
}

export function toPublicBillingProduct(product: BillingProductRecord): PublicBillingProduct {
  return {
    code: product.code,
    name: product.name,
    description: descriptionForPublic(product),
    amountCents: product.amountCents,
    currency: product.currency,
    priceText: formatBillingProductPriceText(product),
    durationDays: product.durationDays,
    durationText: formatBillingProductDurationText(product),
    recommended: recommended(product),
    badgeText: badgeText(product),
    featureBullets: readStringListMetadata(product, "featureBullets"),
    sortOrder: product.sortOrder,
  };
}

export function toAdminBillingProduct(product: BillingProductRecord): AdminBillingProduct {
  return {
    code: product.code,
    name: product.name,
    description: product.description,
    amountCents: product.amountCents,
    currency: product.currency,
    durationDays: product.durationDays,
    enabled: product.enabled,
    sortOrder: product.sortOrder,
    publicVisible: publicVisible(product),
    publicPurchasable: publicPurchasable(product),
    recommended: recommended(product),
    badgeText: badgeText(product),
    featureBullets: readStringListMetadata(product, "featureBullets"),
    metadataJson: safeMetadata(product),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function isPublicFullAccessBillingProduct(product: BillingProductRecord): boolean {
  return (
    publicFullAccessProductCodes.has(product.code) &&
    isFullForecastAccessProduct(product) &&
    product.amountCents > 0 &&
    product.currency === "CNY" &&
    publicPurchasable(product)
  );
}

export async function listPublicBillingProducts(
  options: { readonly client?: DatabaseClient } = {},
): Promise<PublicBillingProduct[]> {
  const client = await resolveClient(options.client);
  const billingProduct = requireDelegate(client.billingProduct, "billingProduct");
  const records = await billingProduct.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return records.map(normalizeBillingProduct).filter(isPublicFullAccessBillingProduct).map(toPublicBillingProduct);
}

export async function listAdminBillingProducts(
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminBillingProduct[]> {
  const client = await resolveClient(options.client);
  const billingProduct = requireDelegate(client.billingProduct, "billingProduct");
  const records = await billingProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return records.map(normalizeBillingProduct).map(toAdminBillingProduct);
}

export async function getAdminBillingProductByCode(
  code: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminBillingProduct | null> {
  const client = await resolveClient(options.client);
  const billingProduct = requireDelegate(client.billingProduct, "billingProduct");
  const record = await billingProduct.findUnique({ where: { code } });
  return record ? toAdminBillingProduct(normalizeBillingProduct(record)) : null;
}

function assertEditableProductUpdate(
  current: BillingProductRecord,
  input: UpdateAdminBillingProductInput,
): void {
  if (input.currency !== undefined && input.currency !== "CNY") {
    throw new InvalidBillingProductUpdateError(current.code, "V1 only supports CNY pricing.");
  }
  if (
    input.amountCents !== undefined &&
    (!Number.isInteger(input.amountCents) || input.amountCents < 0)
  ) {
    throw new InvalidBillingProductUpdateError(current.code, "Product amount must be a non-negative integer.");
  }
  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    throw new InvalidBillingProductUpdateError(current.code, "Product sort order must be an integer.");
  }
  if (input.featureBullets !== undefined) {
    if (
      input.featureBullets.length > 12 ||
      input.featureBullets.some((item) => typeof item !== "string" || item.trim().length > 120)
    ) {
      throw new InvalidBillingProductUpdateError(current.code, "Product feature bullets are invalid.");
    }
  }
  if (current.code === trialFullAccessProductCode) {
    if (input.amountCents !== undefined && input.amountCents !== 0) {
      throw new InvalidBillingProductUpdateError(current.code, "Trial product amount must remain zero.");
    }
    if (input.publicPurchasable === true) {
      throw new InvalidBillingProductUpdateError(current.code, "Trial product cannot be publicly purchasable.");
    }
  } else if (
    publicFullAccessProductCodes.has(current.code) &&
    input.amountCents !== undefined &&
    input.amountCents <= 0
  ) {
    throw new InvalidBillingProductUpdateError(current.code, "Public paid products must have a positive amount.");
  }
}

function nextMetadata(
  current: BillingProductRecord,
  input: UpdateAdminBillingProductInput,
): JsonValue {
  const metadata = {
    ...metadataOf(current),
  };
  if (input.publicVisible !== undefined) {
    metadata.publicVisible = input.publicVisible;
    metadata.public = input.publicVisible;
  }
  if (input.publicPurchasable !== undefined) {
    metadata.publicPurchasable =
      current.code === trialFullAccessProductCode ? false : input.publicPurchasable;
  }
  if (input.recommended !== undefined) {
    metadata.recommended = input.recommended;
  }
  if (input.badgeText !== undefined) {
    if (input.badgeText && input.badgeText.trim()) {
      metadata.badgeText = input.badgeText.trim();
    } else {
      delete metadata.badgeText;
      delete metadata.badge;
    }
  }
  if (input.featureBullets !== undefined) {
    metadata.featureBullets = input.featureBullets.map((item) => item.trim()).filter(Boolean);
  }
  if (input.publicDescription !== undefined) {
    if (input.publicDescription && input.publicDescription.trim()) {
      metadata.publicDescription = input.publicDescription.trim();
    } else {
      delete metadata.publicDescription;
    }
  }
  if (input.shortDescription !== undefined) {
    if (input.shortDescription && input.shortDescription.trim()) {
      metadata.shortDescription = input.shortDescription.trim();
    } else {
      delete metadata.shortDescription;
    }
  }

  if (current.code === trialFullAccessProductCode) {
    metadata.internal = true;
    metadata.publicPurchasable = false;
    metadata.public = false;
    metadata.grantType = fullForecastAccessEntitlementType;
    metadata.source = "registration_trial";
  }

  return cloneJsonValue(metadata);
}

export async function updateAdminBillingProduct(
  input: UpdateAdminBillingProductInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminBillingProduct> {
  const client = await resolveClient(options.client);
  return withTransaction(client, async (tx) => {
    const billingProduct = requireDelegate(tx.billingProduct, "billingProduct");
    if (typeof billingProduct.update !== "function") {
      throw new Error("Database client is missing billingProduct.update delegate.");
    }

    const record = await billingProduct.findUnique({ where: { code: input.code } });
    if (!record) {
      throw new BillingProductNotFoundError(input.code);
    }

    const current = normalizeBillingProduct(record);
    assertEditableProductUpdate(current, input);
    const before = billingProductAdminSnapshot(current);
    const updated = normalizeBillingProduct(
      await billingProduct.update({
        where: { code: current.code },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          metadataJson: nextMetadata(current, input),
        },
      }),
    );
    const after = billingProductAdminSnapshot(updated);

    await createAuditLog(
      {
        actorUserId: input.actorUserId ?? null,
        action: "billing.product.update",
        targetType: "billing_product",
        targetId: updated.code,
        beforeJson: before,
        afterJson: after,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      { client: tx },
    );

    return toAdminBillingProduct(updated);
  });
}
