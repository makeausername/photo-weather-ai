"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { forecastHorizonLabels, forecastTargetLabels } from "@photo-weather/shared";
import {
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromBrowserGeolocation,
  selectedLocationFromSearchResult,
  type BrowserGeolocationReverseResult,
  type SelectedLocation,
} from "./selected-location";
import { LocationSearchInput } from "./location-search-input";
import { Badge, Button, Card, cn } from "./ui";

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

export type SearchStatus = "idle" | "loading" | "ready" | "error";
export type CurrentLocationStatus = "idle" | "loading";

export type BrowserCurrentCoordinates = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly accuracyMeters?: number;
};

type BrowserNavigatorLike = {
  readonly geolocation?: Pick<Geolocation, "getCurrentPosition">;
};

export type PlaceSearchVisibilityState = {
  readonly query: string;
  readonly status: SearchStatus;
  readonly resultsCount: number;
  readonly isActivelySearching: boolean;
  readonly isCollapsedAfterSelection: boolean;
};

export type SearchResultSelectionUiState = {
  readonly query: string;
  readonly isActivelySearching: boolean;
  readonly isCollapsedAfterSelection: boolean;
};

export type SearchQueryInputUiState = {
  readonly isActivelySearching: boolean;
  readonly isCollapsedAfterSelection: boolean;
  readonly shouldClearSelection: boolean;
};

type PlaceSearchCardProps = {
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  readonly badgeLabel?: string | null;
  readonly searchPlaceholder?: string;
  readonly horizonLabel?: string;
  readonly defaultHorizon?: ForecastHorizon;
  readonly defaultTarget?: ForecastTarget;
  readonly fixedTarget?: ForecastTarget;
  readonly showTargetSelector?: boolean;
  readonly targetHelperText?: string;
  readonly ctaLabel?: string;
  readonly ctaDisabledLabel?: string;
  readonly showResultSourceBadges?: boolean;
  readonly selectedLocationDetailMode?: "full" | "compact";
  readonly showSelectedLocationActions?: boolean;
  readonly showSelectedLocationHorizon?: boolean;
  readonly showQuickLocations?: boolean;
  readonly enableCurrentLocation?: boolean;
  readonly currentLocationPrivacyHint?: string;
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

const geolocationPermissionDeniedCode = 1;
const geolocationPositionUnavailableCode = 2;
const geolocationTimeoutCode = 3;

export const currentLocationErrorMessages = {
  unavailable: "当前浏览器不支持定位，请手动搜索地点。",
  denied: "定位权限被拒绝，请手动搜索地点。",
  timeout: "获取当前位置超时，请稍后重试或手动搜索。",
  generic: "无法获取当前位置，请检查浏览器权限或网络。",
} as const;

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

export function shouldShowPlaceSearchResults(state: PlaceSearchVisibilityState): boolean {
  return (
    state.query.trim().length > 0 &&
    state.status === "ready" &&
    state.resultsCount > 0 &&
    state.isActivelySearching &&
    !state.isCollapsedAfterSelection
  );
}

export function shouldShowPlaceSearchFeedback(
  state: Omit<PlaceSearchVisibilityState, "resultsCount">,
): boolean {
  return (
    state.query.trim().length > 0 && state.isActivelySearching && !state.isCollapsedAfterSelection
  );
}

export function buildStateAfterSearchResultSelection(
  result: Pick<PlaceSearchResult, "name">,
): SearchResultSelectionUiState {
  return {
    query: result.name,
    isActivelySearching: false,
    isCollapsedAfterSelection: true,
  };
}

export function buildStateAfterSearchQueryInput(
  value: string,
  selectedLocation: SelectedLocation | null | undefined,
): SearchQueryInputUiState {
  const trimmedValue = value.trim();
  const selectedName = selectedLocation
    ? (selectedLocation.displayName || selectedLocation.name).trim()
    : "";
  const matchesSelectedLocation = Boolean(selectedName) && trimmedValue === selectedName;

  return {
    isActivelySearching: trimmedValue.length > 0 && !matchesSelectedLocation,
    isCollapsedAfterSelection: false,
    shouldClearSelection: Boolean(selectedLocation && !matchesSelectedLocation),
  };
}

export function buildStateAfterClearSelection(): SearchResultSelectionUiState {
  return {
    query: "",
    isActivelySearching: false,
    isCollapsedAfterSelection: false,
  };
}

export function buildStateAfterChangeLocation(
  query: string,
  selectedLocation: SelectedLocation | null | undefined,
): SearchResultSelectionUiState {
  const nextQuery = query.trim() || selectedLocation?.displayName || selectedLocation?.name || "";

  return {
    query: nextQuery,
    isActivelySearching: nextQuery.trim().length > 0,
    isCollapsedAfterSelection: false,
  };
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

export function currentLocationErrorMessage(
  error: Pick<GeolocationPositionError, "code"> | undefined,
): string {
  if (!error) {
    return currentLocationErrorMessages.generic;
  }

  if (error.code === geolocationPermissionDeniedCode) {
    return currentLocationErrorMessages.denied;
  }
  if (error.code === geolocationTimeoutCode) {
    return currentLocationErrorMessages.timeout;
  }
  if (error.code === geolocationPositionUnavailableCode) {
    return currentLocationErrorMessages.generic;
  }

  return currentLocationErrorMessages.generic;
}

export function requestBrowserCurrentCoordinates(
  navigatorLike: BrowserNavigatorLike | undefined = typeof navigator !== "undefined"
    ? navigator
    : undefined,
): Promise<BrowserCurrentCoordinates> {
  if (!navigatorLike?.geolocation) {
    return Promise.reject(new Error(currentLocationErrorMessages.unavailable));
  }

  return new Promise((resolve, reject) => {
    navigatorLike.geolocation?.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          reject(new Error(currentLocationErrorMessages.generic));
          return;
        }

        resolve({
          latitudeWgs84: latitude,
          longitudeWgs84: longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : undefined,
        });
      },
      (error) => {
        reject(new Error(currentLocationErrorMessage(error)));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}

async function reverseGeocodeCurrentLocation(
  coordinates: BrowserCurrentCoordinates,
): Promise<BrowserGeolocationReverseResult | null> {
  try {
    const params = new URLSearchParams({
      lat: String(coordinates.latitudeWgs84),
      lng: String(coordinates.longitudeWgs84),
    });
    const response = await fetch(`${apiBaseUrl}/search/reverse-geocode?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as BrowserGeolocationReverseResult;
    return data.available === true ? data : null;
  } catch {
    return null;
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
  showResultSourceBadges = true,
  selectedLocationDetailMode = "full",
  showSelectedLocationActions = false,
  showSelectedLocationHorizon = false,
  showQuickLocations: shouldRenderQuickLocations = true,
  enableCurrentLocation = false,
  currentLocationPrivacyHint = "浏览器定位仅用于本次天气判断，不会公开显示。",
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: PlaceSearchCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    () => selectedLocation?.displayName || selectedLocation?.name || "",
  );
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<readonly PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [browserSelectedLocation, setBrowserSelectedLocation] = useState<SelectedLocation | null>(
    null,
  );
  const [isActivelySearching, setIsActivelySearching] = useState(false);
  const [isCollapsedAfterSelection, setIsCollapsedAfterSelection] = useState(false);
  const [horizon, setHorizon] = useState<ForecastHorizon>(defaultHorizon);
  const [target, setTarget] = useState<ForecastTarget>(fixedTarget ?? defaultTarget);
  const [currentLocationStatus, setCurrentLocationStatus] = useState<CurrentLocationStatus>("idle");
  const [currentLocationError, setCurrentLocationError] = useState("");

  const trimmedQuery = query.trim();
  const activeTarget = fixedTarget ?? (showTargetSelector ? target : defaultTarget);
  const internalSelectedLocation = useMemo(
    () =>
      selectedPlace ? selectedLocationFromSearchResult(selectedPlace) : browserSelectedLocation,
    [browserSelectedLocation, selectedPlace],
  );
  const activeSelectedLocation =
    selectedLocation !== undefined ? selectedLocation : internalSelectedLocation;
  const visibilityState: PlaceSearchVisibilityState = {
    query,
    status,
    resultsCount: results.length,
    isActivelySearching,
    isCollapsedAfterSelection,
  };
  const showSearchFeedback = shouldShowPlaceSearchFeedback(visibilityState);
  const showSearchResults = shouldShowPlaceSearchResults(visibilityState);
  const showEmptyState = showSearchFeedback && status === "ready" && results.length === 0;
  const showQuickLocationSection =
    shouldRenderQuickLocations && (!activeSelectedLocation || isActivelySearching);
  const isCurrentLocationLoading = currentLocationStatus === "loading";

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

  const clearSelection = useCallback(() => {
    setSelectedPlace(null);
    setBrowserSelectedLocation(null);
    onSelectedLocationChange?.(null);
  }, [onSelectedLocationChange]);

  const searchPlaces = useCallback(
    async (
      nextQuery: string,
      signal?: AbortSignal,
      options: { readonly preserveSelection?: boolean } = {},
    ) => {
      const keyword = nextQuery.trim();
      if (!options.preserveSelection) {
        clearSelection();
      }
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
    [clearSelection],
  );

  useEffect(() => {
    if (!trimmedQuery) {
      setStatus("idle");
      setResults([]);
      setErrorMessage("");
      return;
    }

    if (!isActivelySearching) {
      return;
    }

    const selectedName = activeSelectedLocation
      ? (activeSelectedLocation.displayName || activeSelectedLocation.name).trim()
      : "";
    if (isCollapsedAfterSelection && selectedName && trimmedQuery === selectedName) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(trimmedQuery, controller.signal, {
        preserveSelection: Boolean(selectedName && trimmedQuery === selectedName),
      });
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeSelectedLocation,
    isActivelySearching,
    isCollapsedAfterSelection,
    searchPlaces,
    trimmedQuery,
  ]);

  useEffect(() => {
    if (!selectedLocation) {
      return;
    }

    const selectedName = selectedLocation.displayName || selectedLocation.name;
    setQuery((currentQuery) =>
      currentQuery.trim() === selectedName.trim() ? currentQuery : selectedName,
    );
    setIsActivelySearching(false);
    setIsCollapsedAfterSelection(true);
  }, [selectedLocation]);

  const handleQueryChange = useCallback(
    (value: string) => {
      const nextState = buildStateAfterSearchQueryInput(value, activeSelectedLocation);
      setQuery(value);
      setCurrentLocationError("");
      setIsActivelySearching(nextState.isActivelySearching);
      setIsCollapsedAfterSelection(nextState.isCollapsedAfterSelection);

      if (nextState.shouldClearSelection) {
        clearSelection();
      }

      if (!value.trim()) {
        setStatus("idle");
        setResults([]);
        setErrorMessage("");
      }
    },
    [activeSelectedLocation, clearSelection],
  );

  const handleSelectResult = useCallback(
    (result: PlaceSearchResult) => {
      const nextState = buildStateAfterSearchResultSelection(result);
      setSelectedPlace(result);
      setBrowserSelectedLocation(null);
      setQuery(nextState.query);
      setCurrentLocationError("");
      setIsActivelySearching(nextState.isActivelySearching);
      setIsCollapsedAfterSelection(nextState.isCollapsedAfterSelection);
      onSelectedLocationChange?.(selectedLocationFromSearchResult(result));
    },
    [onSelectedLocationChange],
  );

  const handleUseCurrentLocation = useCallback(async () => {
    setCurrentLocationStatus("loading");
    setCurrentLocationError("");
    setStatus("idle");
    setResults([]);
    setErrorMessage("");

    try {
      const coordinates = await requestBrowserCurrentCoordinates();
      const reverseGeocode = await reverseGeocodeCurrentLocation(coordinates);
      const currentLocation = selectedLocationFromBrowserGeolocation({
        ...coordinates,
        reverseGeocode,
      });

      setSelectedPlace(null);
      setBrowserSelectedLocation(currentLocation);
      setQuery(currentLocation.displayName);
      setIsActivelySearching(false);
      setIsCollapsedAfterSelection(true);
      onSelectedLocationChange?.(currentLocation);
    } catch (error) {
      setCurrentLocationError(
        error instanceof Error ? error.message : currentLocationErrorMessages.generic,
      );
    } finally {
      setCurrentLocationStatus("idle");
    }
  }, [onSelectedLocationChange]);

  const handleChangeLocation = useCallback(() => {
    const nextState = buildStateAfterChangeLocation(query, activeSelectedLocation);
    const nextQuery = nextState.query;

    if (!trimmedQuery && nextQuery) {
      setQuery(nextQuery);
    }

    setIsCollapsedAfterSelection(nextState.isCollapsedAfterSelection);
    setIsActivelySearching(nextState.isActivelySearching);
    setCurrentLocationError("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (nextQuery.trim() && (status !== "ready" || results.length === 0)) {
      void searchPlaces(nextQuery, undefined, { preserveSelection: true });
    }
  }, [activeSelectedLocation, query, results.length, searchPlaces, status, trimmedQuery]);

  const handleClearSelection = useCallback(() => {
    const nextState = buildStateAfterClearSelection();
    setQuery(nextState.query);
    setIsActivelySearching(nextState.isActivelySearching);
    setIsCollapsedAfterSelection(nextState.isCollapsedAfterSelection);
    setStatus("idle");
    setResults([]);
    setErrorMessage("");
    setCurrentLocationError("");
    clearSelection();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [clearSelection]);

  const handleSubmitSearch = useCallback(() => {
    const selectedName = activeSelectedLocation
      ? (activeSelectedLocation.displayName || activeSelectedLocation.name).trim()
      : "";
    const preserveSelection = Boolean(selectedName && trimmedQuery === selectedName);

    setCurrentLocationError("");
    setIsCollapsedAfterSelection(false);
    setIsActivelySearching(trimmedQuery.length > 0);
    void searchPlaces(query, undefined, { preserveSelection });
  }, [activeSelectedLocation, query, searchPlaces, trimmedQuery]);

  const handleRunForecast = useCallback(() => {
    if (!activeSelectedLocation) {
      return;
    }

    window.location.assign(
      buildForecastUrlFromSelectedLocation(activeSelectedLocation, horizon, activeTarget),
    );
  }, [activeSelectedLocation, activeTarget, horizon]);

  return (
    <Card className={cn("grid min-w-0 gap-4 p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {badgeLabel ? <Badge variant="muted">{badgeLabel}</Badge> : null}
      </div>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmitSearch();
        }}
      >
        <LocationSearchInput
          inputRef={inputRef}
          value={query}
          placeholder={searchPlaceholder}
          onInputChange={handleQueryChange}
          onSearch={handleSubmitSearch}
          onUseCurrentLocation={enableCurrentLocation ? handleUseCurrentLocation : undefined}
          loading={isCurrentLocationLoading}
        />
        <Button type="submit" size="sm" className="h-9 w-full" disabled={status === "loading"}>
          搜索地点
        </Button>
        {enableCurrentLocation && currentLocationPrivacyHint ? (
          <p className="text-xs leading-5 text-muted-foreground">{currentLocationPrivacyHint}</p>
        ) : null}
      </form>

      {showQuickLocationSection ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted-foreground">常用机位</p>
          <PopularSpotChips onSelect={handleQueryChange} />
        </div>
      ) : null}

      <div aria-live="polite" className="grid gap-2">
        {currentLocationStatus === "loading" ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            正在获取当前位置...
          </div>
        ) : null}

        {currentLocationError ? <PlaceSearchErrorAlert message={currentLocationError} /> : null}

        {showSearchFeedback && status === "loading" ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            正在搜索地点...
          </div>
        ) : null}

        {showSearchFeedback && status === "error" ? (
          <PlaceSearchErrorAlert message={errorMessage} />
        ) : null}

        {showEmptyState ? (
          <div className="rounded-lg border border-border bg-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
            暂未找到相关地点，请尝试输入景区、城市或具体机位名称。
          </div>
        ) : null}

        {showSearchResults ? (
          <div
            data-place-search-results="true"
            className="max-h-[220px] overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card"
          >
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => handleSelectResult(result)}
                className={cn(
                  "grid w-full min-w-0 gap-1.5 border-b border-border px-3 py-2.5 text-left transition last:border-b-0 hover:bg-secondary",
                  selectedPlace?.id === result.id && "bg-secondary",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-card-foreground">{result.name}</span>
                  {showResultSourceBadges ? (
                    <Badge variant="muted">{sourceLabels[result.source]}</Badge>
                  ) : null}
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
        <div
          data-selected-location-card="true"
          className="grid gap-3 rounded-lg border border-border bg-muted p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">已选地点</p>
              <p className="mt-1 break-words text-base font-bold text-card-foreground">
                {activeSelectedLocation.displayName}
              </p>
            </div>
            <SelectedLocationBadge location={activeSelectedLocation} />
          </div>
          {selectedLocationDetailMode === "compact" ? (
            <CompactSelectedLocationDetails
              location={activeSelectedLocation}
              horizonLabel={
                showSelectedLocationHorizon ? forecastHorizonLabels[horizon] : undefined
              }
              coordinateText={
                selectedPlace && activeSelectedLocation.id === selectedPlace.id
                  ? selectedCoordinateText
                  : formatSelectedLocationCoordinates(activeSelectedLocation)
              }
            />
          ) : (
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
          )}
          {showSelectedLocationActions ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleChangeLocation}>
                更换地点
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSelection}>
                清除选择
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div data-forecast-range-section="true" className="grid gap-3 border-t border-border pt-4">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-card-foreground">{horizonLabel}</p>
          <HorizonSelector value={horizon} onChange={setHorizon} />
        </div>

        {fixedTarget ? (
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">分析题材</p>
            <p className="mt-1 text-sm font-bold text-card-foreground">
              {forecastTargetLabels[fixedTarget]}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              本页专注当前题材，结果页会优先呈现对应窗口和风险。
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
          onClick={handleRunForecast}
        >
          {activeSelectedLocation ? ctaLabel : ctaDisabledLabel ?? ctaLabel}
        </Button>
      </div>
    </Card>
  );
}

function formatSelectedLocationArea(location: SelectedLocation): string {
  const area = [location.province, location.city, location.district].filter(Boolean).join(" / ");
  if (location.source === "browser_geolocation" && area) {
    return area;
  }

  return location.scenicArea ?? (area || "位置资料待补充");
}

function CompactSelectedLocationDetails({
  location,
  horizonLabel,
  coordinateText,
}: {
  readonly location: SelectedLocation;
  readonly horizonLabel?: string;
  readonly coordinateText: string;
}) {
  const elevationText = formatSelectedLocationElevation(location);

  return (
    <div className="grid gap-2 text-xs leading-5 text-muted-foreground">
      <div>
        <p className="font-semibold text-card-foreground">所在地</p>
        <p>{formatSelectedLocationArea(location)}</p>
      </div>
      {elevationText ? (
        <div>
          <p className="font-semibold text-card-foreground">海拔</p>
          <p>{elevationText}</p>
        </div>
      ) : null}
      {horizonLabel ? (
        <div>
          <p className="font-semibold text-card-foreground">判断范围</p>
          <p>{horizonLabel}</p>
        </div>
      ) : null}
      <details className="rounded-md border border-border bg-card px-3 py-2">
        <summary className="cursor-pointer font-semibold text-card-foreground">坐标信息</summary>
        <p className="mt-2 break-words">{coordinateText}</p>
      </details>
    </div>
  );
}

function formatSelectedLocationElevation(location: SelectedLocation): string {
  if (typeof location.elevationMeters === "number" && Number.isFinite(location.elevationMeters)) {
    return `${Math.round(location.elevationMeters)} 米`;
  }

  return location.source === "browser_geolocation" ? "海拔将在生成判断时补全" : "";
}

function formatSelectedLocationCoordinates(location: SelectedLocation): string {
  const gcj02 =
    typeof location.latitudeGcj02 === "number" && typeof location.longitudeGcj02 === "number"
      ? `GCJ-02：${formatCoordinate(location.latitudeGcj02)}, ${formatCoordinate(location.longitudeGcj02)}；`
      : "";

  return `${gcj02}WGS84：${formatCoordinate(location.latitudeWgs84)}, ${formatCoordinate(location.longitudeWgs84)}`;
}

function SelectedLocationBadge({ location }: { readonly location: SelectedLocation }) {
  if (location.photoSpotId) {
    return (
      <Badge variant="success" className="shrink-0">
        已匹配机位
      </Badge>
    );
  }

  if (location.source === "browser_geolocation") {
    return (
      <Badge variant="info" className="shrink-0">
        当前定位
      </Badge>
    );
  }

  return null;
}
