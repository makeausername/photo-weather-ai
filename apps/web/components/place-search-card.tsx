"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { forecastHorizonLabels, forecastTargetLabels } from "@photo-weather/shared";
import { Badge, Button, Card, Input, cn } from "./ui";

type PlaceResultSource = "local_location" | "local_photo_spot" | "amap" | "mock";

type PlaceSearchResult = {
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

type SearchStatus = "idle" | "loading" | "ready" | "error";

type PlaceSearchCardProps = {
  readonly className?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const quickLocations = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

const horizonOptions: readonly ForecastHorizon[] = ["24h", "48h", "72h", "7d"];

const targetOptions: readonly ForecastTarget[] = ["general", "cloud_sea", "glow", "astro"];

const sourceLabels: Record<PlaceResultSource, string> = {
  local_location: "本地地点",
  local_photo_spot: "本地机位",
  amap: "高德地图",
  mock: "模拟数据",
};

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

function buildForecastUrl(
  place: PlaceSearchResult,
  horizon: ForecastHorizon,
  target: ForecastTarget,
): string {
  const params = new URLSearchParams({
    name: place.name,
    source: place.source,
    lat: String(place.latitudeGcj02),
    lng: String(place.longitudeGcj02),
    latWgs84: String(place.latitudeWgs84),
    lngWgs84: String(place.longitudeWgs84),
    horizon,
    target,
  });

  if (place.matchedLocationId) {
    params.set("locationId", place.matchedLocationId);
  }

  if (place.matchedPhotoSpotId) {
    params.set("photoSpotId", place.matchedPhotoSpotId);
  }

  return `/forecast?${params.toString()}`;
}

export function PlaceSearchCard({ className }: PlaceSearchCardProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<readonly PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [horizon, setHorizon] = useState<ForecastHorizon>("48h");
  const [target, setTarget] = useState<ForecastTarget>("general");

  const trimmedQuery = query.trim();
  const showEmptyState = status === "ready" && trimmedQuery.length > 0 && results.length === 0;

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

  const searchPlaces = useCallback(async (nextQuery: string, signal?: AbortSignal) => {
    const keyword = nextQuery.trim();
    setSelectedPlace(null);
    if (!keyword) {
      setStatus("idle");
      setResults([]);
      return;
    }

    setStatus("loading");
    try {
      const response = await fetch(`${apiBaseUrl}/search/places?q=${encodeURIComponent(keyword)}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error("地点搜索暂时不可用。");
      }

      const data = (await response.json()) as SearchResponse;
      setResults(data.results);
      setStatus("ready");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }

      setResults([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!trimmedQuery) {
      setStatus("idle");
      setResults([]);
      setSelectedPlace(null);
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
  }, [searchPlaces, trimmedQuery]);

  return (
    <Card className={cn("grid gap-4 p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">选择拍摄地点</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">搜索景区、城市或具体机位</p>
        </div>
        <Badge variant="muted">模拟数据</Badge>
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
          placeholder="请输入拍摄地点"
          className="h-9 bg-card text-sm"
        />
        <Button type="submit" size="sm" className="h-9 w-full" disabled={status === "loading"}>
          搜索地点
        </Button>
      </form>

      <div className="grid gap-2">
        <p className="text-xs font-semibold text-muted-foreground">常用机位</p>
        <div className="flex flex-wrap gap-2">
          {quickLocations.map((location) => (
            <button
              key={location}
              type="button"
              onClick={() => setQuery(location)}
              className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
            >
              {location}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="grid gap-2">
        {status === "loading" ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            正在搜索地点...
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-lg border border-danger bg-card px-3 py-2 text-sm text-danger">
            地点搜索暂时不可用，请稍后重试。
          </div>
        ) : null}

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
                onClick={() => setSelectedPlace(result)}
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

      {selectedPlace ? (
        <div className="grid gap-3 rounded-lg border border-border bg-muted p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">已选地点</p>
              <p className="mt-1 break-words text-base font-bold text-card-foreground">
                {selectedPlace.name}
              </p>
            </div>
            {selectedPlace.matchedPhotoSpotId ? (
              <Badge variant="success" className="shrink-0">
                已匹配机位
              </Badge>
            ) : null}
          </div>
          <dl className="grid gap-2 text-xs leading-5 text-muted-foreground">
            <div>
              <dt className="font-semibold text-card-foreground">位置</dt>
              <dd>{formatAddressAndCity(selectedPlace)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-card-foreground">坐标</dt>
              <dd className="break-words">{selectedCoordinateText}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid gap-3 border-t border-border pt-4">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-card-foreground">预报范围</p>
          <div className="grid grid-cols-2 gap-2">
            {horizonOptions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={horizon === option}
                onClick={() => setHorizon(option)}
                className={cn(
                  "h-8 rounded-md border px-2 text-xs font-semibold transition",
                  horizon === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary",
                )}
              >
                {forecastHorizonLabels[option]}
              </button>
            ))}
          </div>
        </div>

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

        <Button
          type="button"
          className="h-9 w-full"
          disabled={!selectedPlace}
          onClick={() => {
            if (!selectedPlace) {
              return;
            }

            window.location.assign(buildForecastUrl(selectedPlace, horizon, target));
          }}
        >
          查看拍摄天气分析
        </Button>
      </div>
    </Card>
  );
}
