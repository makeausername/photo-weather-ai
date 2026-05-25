"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { forecastHorizonLabels, forecastTargetLabels } from "@photo-weather/shared";
import {
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromSearchResult,
  type SelectedLocation,
} from "./selected-location";
import { Badge, Button, Card, Input, cn } from "./ui";

export type PlaceResultSource = "local_location" | "local_photo_spot" | "amap" | "mock";

export type PlaceSearchResult = {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly source: PlaceResultSource;
  readonly locationType: string;
  readonly matchedPhotoSpotId?: string;
  readonly matchedLocationId?: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly isVerified: boolean;
};

type SearchResponse = {
  readonly query: string;
  readonly results: readonly PlaceSearchResult[];
};

type SearchErrorPayload = {
  readonly message?: string;
  readonly error?: string;
};

type SearchStatus = "idle" | "loading" | "ready" | "error";

type PlaceSearchCardProps = {
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  readonly badgeLabel?: string;
  readonly searchPlaceholder?: string;
  readonly horizonLabel?: string;
  readonly defaultHorizon?: ForecastHorizon;
  readonly defaultTarget?: ForecastTarget;
  readonly fixedTarget?: ForecastTarget;
  readonly showTargetSelector?: boolean;
  readonly targetHelperText?: string;
  readonly ctaLabel?: string;
  readonly ctaDisabledLabel?: string;
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const publicPlaceSearchUnavailableMessage =
  "地点搜索暂时不可用，请检查数据库连接或稍后重试。";

const unsafeSearchErrorPatterns: readonly RegExp[] = [
  /prisma/i,
  /database/i,
  /findMany\(/i,
  /require[A-Z]\w*Delegate/i,
  /Can't reach database server/i,
  /127\.0\.0\.1:15432/i,
  /P1001/i,
  /:\d+:\d+/,
  /[A-Z]:\\/,
  /\.ts:\d+/,
  /\bat\s+/,
  /^[a-z0-9_]+$/,
];

const quickLocations = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

export const horizonOptions: readonly ForecastHorizon[] = ["24h", "48h", "72h", "7d"];

const targetOptions: readonly ForecastTarget[] = ["general", "cloud_sea", "glow", "astro"];

const sourceLabels: Record<PlaceResultSource, string> = {
  local_location: "本地地点",
  local_photo_spot: "本地机位",
  amap: "高德地图",
  mock: "备用地点",
};

export function sanitizePlaceSearchErrorMessage(message: string | undefined): string {
  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return publicPlaceSearchUnavailableMessage;
  }

  if (unsafeSearchErrorPatterns.some((pattern) => pattern.test(trimmedMessage))) {
    return publicPlaceSearchUnavailableMessage;
  }

  return trimmedMessage;
}

export function PlaceSearchErrorAlert({ message }: { readonly message?: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger bg-card px-3 py-2 text-sm leading-6 text-danger"
    >
      {sanitizePlaceSearchErrorMessage(message)}
    </div>
  );
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

function formatArea(result: PlaceSearchResult): string {
  return [result.province, result.city, result.district].filter(Boolean).join(" / ");
}

function formatAddress(result: PlaceSearchResult): string {
  const area = formatArea(result);
  return result.address ?? (area || "地址待补充");
}

function formatAddressAndCity(result: PlaceSearchResult): string {
  const address = formatAddress(result);
  const area = formatArea(result);

  if (!area || address.includes(area.replaceAll(" / ", ""))) {
    return address;
  }

  return `${address} / ${area}`;
}

async function readSearchErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return publicPlaceSearchUnavailableMessage;
  }

  try {
    const payload = JSON.parse(text) as SearchErrorPayload;
    return sanitizePlaceSearchErrorMessage(payload.message || payload.error);
  } catch {
    return publicPlaceSearchUnavailableMessage;
  }
}

export function buildForecastUrl(
  place: PlaceSearchResult,
  horizon: ForecastHorizon,
  target: ForecastTarget,
): string {
  return buildForecastUrlFromSelectedLocation(
    selectedLocationFromSearchResult(place),
    horizon,
    target,
  );
}

export function PopularSpotChips({
  locations = quickLocations,
  onSelect,
}: {
  readonly locations?: readonly string[];
  readonly onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map((location) => (
        <button
          key={location}
          type="button"
          onClick={() => onSelect(location)}
          className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
        >
          {location}
        </button>
      ))}
    </div>
  );
}

export function HorizonSelector({
  value,
  onChange,
}: {
  readonly value: ForecastHorizon;
  readonly onChange: (value: ForecastHorizon) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {horizonOptions.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-8 rounded-md border px-2 text-xs font-semibold transition",
            value === option
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary",
          )}
        >
          {forecastHorizonLabels[option]}
        </button>
      ))}
    </div>
  );
}

export function PlaceSearchCard({
  className,
  title = "选择拍摄地点",
  description = "搜索景区、城市或具体机位",
  badgeLabel = "本地优先",
  searchPlaceholder = "请输入拍摄地点",
  horizonLabel = "预报范围选择",
  defaultHorizon = "48h",
  defaultTarget = "general",
  fixedTarget,
  showTargetSelector = true,
  targetHelperText,
  ctaLabel = "查看拍摄天气分析",
  ctaDisabledLabel,
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: PlaceSearchCardProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<readonly PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [horizon, setHorizon] = useState<ForecastHorizon>(defaultHorizon);
  const [target, setTarget] = useState<ForecastTarget>(fixedTarget ?? defaultTarget);

  const trimmedQuery = query.trim();
  const showEmptyState = status === "ready" && trimmedQuery.length > 0 && results.length === 0;
  const activeTarget = fixedTarget ?? (showTargetSelector ? target : defaultTarget);
  const internalSelectedLocation = useMemo(
    () => (selectedPlace ? selectedLocationFromSearchResult(selectedPlace) : null),
    [selectedPlace],
  );
  const activeSelectedLocation =
    selectedLocation !== undefined ? selectedLocation : internalSelectedLocation;

  useEffect(() => {
    onForecastOptionsChange?.({ horizon, target: activeTarget });
  }, [activeTarget, horizon, onForecastOptionsChange]);

  const selectedCoordinateText = useMemo(() => {
    if (!selectedPlace) {
      return "";
    }

    return `GCJ-02：${formatCoordinate(selectedPlace.latitudeGcj02)}, ${formatCoordinate(
      selectedPlace.longitudeGcj02,
    )}；WGS84：${formatCoordinate(selectedPlace.latitudeWgs84)}, ${formatCoordinate(
      selectedPlace.longitudeWgs84,
    )}`;
  }, [selectedPlace]);

  const searchPlaces = useCallback(
    async (nextQuery: string, signal?: AbortSignal) => {
      const keyword = nextQuery.trim();
      setSelectedPlace(null);
      onSelectedLocationChange?.(null);
      if (!keyword) {
        setStatus("idle");
        setResults([]);
        setErrorMessage("");
        return;
      }

      setStatus("loading");
      setErrorMessage("");
      try {
        const response = await fetch(
          `${apiBaseUrl}/search/places?q=${encodeURIComponent(keyword)}`,
          {
            signal,
          },
        );
        if (!response.ok) {
          throw new Error(await readSearchErrorMessage(response));
        }

        const data = (await response.json()) as SearchResponse;
        setResults(data.results);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setResults([]);
        setErrorMessage(sanitizePlaceSearchErrorMessage((error as Error).message));
        setStatus("error");
      }
    },
    [onSelectedLocationChange],
  );

  useEffect(() => {
    if (!trimmedQuery) {
      setStatus("idle");
      setResults([]);
      setSelectedPlace(null);
      onSelectedLocationChange?.(null);
      setErrorMessage("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(trimmedQuery, controller.signal);
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [onSelectedLocationChange, searchPlaces, trimmedQuery]);

  return (
    <Card className={cn("grid gap-4 p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void searchPlaces(query);
        }}
      >
        <Input
          aria-label="目的地"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 bg-card text-sm"
        />
        <Button type="submit" size="sm" className="h-9 w-full" disabled={status === "loading"}>
          搜索地点
        </Button>
      </form>

      <div className="grid gap-2">
        <p className="text-xs font-semibold text-muted-foreground">常用机位</p>
        <PopularSpotChips onSelect={setQuery} />
      </div>

      <div aria-live="polite" className="grid gap-2">
        {status === "loading" ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            正在搜索地点...
          </div>
        ) : null}

        {status === "error" ? <PlaceSearchErrorAlert message={errorMessage} /> : null}

        {showEmptyState ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
            暂未找到相关地点，请尝试输入景区、城市或具体机位名称。
          </div>
        ) : null}

        {status === "ready" && results.length > 0 ? (
          <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border bg-card">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => {
                  setSelectedPlace(result);
                  onSelectedLocationChange?.(selectedLocationFromSearchResult(result));
                }}
                className={cn(
                  "grid w-full gap-1.5 border-b border-border px-3 py-2.5 text-left transition last:border-b-0 hover:bg-secondary",
                  selectedPlace?.id === result.id && "bg-secondary",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-card-foreground">{result.name}</span>
                  <Badge variant="muted">{sourceLabels[result.source]}</Badge>
                  <Badge variant={result.isVerified ? "success" : "warning"}>
                    {result.isVerified ? "已验证" : "待验证"}
                  </Badge>
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  {formatAddressAndCity(result)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeSelectedLocation ? (
        <div className="grid gap-3 rounded-lg border border-border bg-muted p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">已选地点</p>
              <p className="mt-1 break-words text-base font-bold text-card-foreground">
                {activeSelectedLocation.displayName}
              </p>
            </div>
            {activeSelectedLocation.photoSpotId ? (
              <Badge variant="success" className="shrink-0">
                已匹配机位
              </Badge>
            ) : null}
          </div>
          <dl className="grid gap-2 text-xs leading-5 text-muted-foreground">
            <div>
              <dt className="font-semibold text-card-foreground">位置</dt>
              <dd>{formatSelectedLocationArea(activeSelectedLocation)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-card-foreground">坐标</dt>
              <dd className="break-words">
                {selectedPlace && activeSelectedLocation.id === selectedPlace.id
                  ? selectedCoordinateText
                  : formatSelectedLocationCoordinates(activeSelectedLocation)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid gap-3 border-t border-border pt-4">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-card-foreground">{horizonLabel}</p>
          <HorizonSelector value={horizon} onChange={setHorizon} />
        </div>

        {fixedTarget ? (
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">固定分析目标</p>
            <p className="mt-1 text-sm font-bold text-card-foreground">
              {forecastTargetLabels[fixedTarget]}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              当前页面已固定题材，结果页会按该题材排序窗口和评分。
            </p>
          </div>
        ) : showTargetSelector ? (
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-card-foreground">分析目标</p>
            <div className="grid grid-cols-2 gap-2">
              {targetOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={target === option}
                  onClick={() => setTarget(option)}
                  className={cn(
                    "h-8 rounded-md border px-2 text-xs font-semibold transition",
                    target === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary",
                  )}
                >
                  {forecastTargetLabels[option]}
                </button>
              ))}
            </div>
          </div>
        ) : targetHelperText ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
            {targetHelperText}
          </p>
        ) : null}

        <Button
          type="button"
          className="h-9 w-full"
          disabled={!activeSelectedLocation}
          onClick={() => {
            if (!activeSelectedLocation) {
              return;
            }

            window.location.assign(
              buildForecastUrlFromSelectedLocation(activeSelectedLocation, horizon, activeTarget),
            );
          }}
        >
          {activeSelectedLocation ? ctaLabel : ctaDisabledLabel ?? ctaLabel}
        </Button>
      </div>
    </Card>
  );
}

function formatSelectedLocationArea(location: SelectedLocation): string {
  const area = [location.province, location.city, location.district].filter(Boolean).join(" / ");
  return location.scenicArea ?? (area || "位置资料待补充");
}

function formatSelectedLocationCoordinates(location: SelectedLocation): string {
  const gcj02 =
    typeof location.latitudeGcj02 === "number" && typeof location.longitudeGcj02 === "number"
      ? `GCJ-02：${formatCoordinate(location.latitudeGcj02)}, ${formatCoordinate(location.longitudeGcj02)}；`
      : "";

  return `${gcj02}WGS84：${formatCoordinate(location.latitudeWgs84)}, ${formatCoordinate(location.longitudeWgs84)}`;
}
