"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const quickLocations = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

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
  return [result.province, result.city, result.district].filter(Boolean).join(" ");
}

function formatAddress(result: PlaceSearchResult): string {
  const area = formatArea(result);
  return result.address ?? (area || "地址待补充");
}

export function PlaceSearchCard() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<readonly PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);

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
      const response = await fetch(
        `${apiBaseUrl}/search/places?q=${encodeURIComponent(keyword)}`,
        { signal },
      );
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
    <Card className="mt-6 grid max-w-[620px] gap-3 p-4 shadow-soft">
      <form
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void searchPlaces(query);
        }}
      >
        <Input
          aria-label="目的地"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="请输入景区、城市或机位，例如：黄山光明顶"
          className="h-11 text-[15px]"
        />
        <Button type="submit" size="lg" className="h-11 px-6" disabled={status === "loading"}>
          开始分析
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {quickLocations.map((location) => (
          <button
            key={location}
            type="button"
            onClick={() => setQuery(location)}
            className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
          >
            {location}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="grid gap-2">
        {status === "loading" ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            正在搜索…
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
          <div className="max-h-[340px] overflow-y-auto rounded-lg border border-border bg-card shadow-sm">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => setSelectedPlace(result)}
                className={cn(
                  "grid w-full gap-2 border-b border-border px-3 py-3 text-left transition last:border-b-0 hover:bg-secondary",
                  selectedPlace?.id === result.id && "bg-secondary",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-card-foreground">{result.name}</span>
                  <Badge variant="muted">{sourceLabels[result.source]}</Badge>
                  <Badge variant={result.isVerified ? "success" : "warning"}>
                    {result.isVerified ? "已核验" : "待核验"}
                  </Badge>
                </span>
                <span className="text-sm leading-6 text-muted-foreground">
                  {formatAddress(result)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selectedPlace ? (
        <div className="grid gap-3 rounded-lg border border-border bg-secondary p-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">地点名称</p>
            <p className="mt-1 font-bold text-secondary-foreground">{selectedPlace.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">地址</p>
            <p className="mt-1 text-sm leading-6 text-secondary-foreground">
              {formatAddress(selectedPlace)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">经纬度</p>
            <p className="mt-1 break-words text-sm leading-6 text-secondary-foreground">
              {selectedCoordinateText}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">数据来源</p>
              <p className="mt-1 text-sm font-semibold text-secondary-foreground">
                {sourceLabels[selectedPlace.source]}
              </p>
            </div>
            <a
              href={`/forecast/placeholder?placeId=${encodeURIComponent(selectedPlace.id)}`}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              查看拍摄天气分析
            </a>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
