"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  ForecastCalculationResult,
  ForecastHorizon,
  ForecastQueryInput,
  ForecastTarget,
  ProfessionalHourlyDataPoint,
} from "@photo-weather/shared";
import { requestForecastCalculation } from "../app/forecast/forecast-request-client";
import { weatherDateKey, summarizeWeatherHours } from "../app/forecast/general-weather-data";
import { HourlyWeatherMatrix } from "../app/forecast/hourly-weather-matrix";
import {
  hourlyColumnGroups,
  hourlyColumnVisibility,
  type HourlyColumnGroup,
} from "../app/forecast/professional-hourly-columns";
import { ReportShareButton } from "../app/forecast/report-share-button";
import { buildShareDocument } from "../app/forecast/report-share-document";
import { buildPhotographyOutlook } from "../app/forecast/photography-outlook";
import { publicApiFetch } from "./api-client";
import {
  buildForecastRequestPayload,
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromBrowserGeolocation,
  selectedLocationFromForecastQuery,
  selectedLocationFromSearchResult,
  type SelectedLocation,
} from "./selected-location";
import { CloudSeaMap } from "./cloud-sea-map";
import { usePublicSiteSettings } from "./public-site-settings";
import { WeatherGlyph } from "./weather-glyph";
import {
  addRecent,
  averageField,
  glowScore,
  nightEvent,
  nightTime,
  emptyLibrary,
  formatWeatherNumber as n,
  freeStorageKey,
  hoursForDate,
  localTime,
  localWindow,
  locationKey,
  parseLocalLibrary,
  presetLocations,
  scoreAvailable,
  toggleFavorite,
  type LocalWeatherLibrary,
} from "./free-weather-data";

export type WeatherView = "sun" | "stars" | "map" | "weather";
const targets: Record<WeatherView, ForecastTarget> = {
  sun: "glow",
  stars: "astro",
  map: "cloud_sea",
  weather: "general",
};
const headings: Record<WeatherView, [string, string]> = {
  sun: ["日出日落与云层变化", "朝霞与晚霞预报"],
  stars: ["月光、云量与观测时段", "星空与银河观测"],
  map: ["地图选点，查看当地预报", "云海地图"],
  weather: ["温度、降水与逐小时变化", "天气与拍摄条件"],
};
type SearchPlace = Parameters<typeof selectedLocationFromSearchResult>[0];

export function FreeWeatherWorkbench({
  view = "sun",
  initialQuery,
}: {
  readonly view?: WeatherView;
  readonly initialQuery?: ForecastQueryInput;
}) {
  const { config: siteSettings, refresh: refreshSiteSettings } = usePublicSiteSettings();
  const [library, setLibrary] = useState<LocalWeatherLibrary>(emptyLibrary);
  const [location, setLocation] = useState<SelectedLocation | null>(
    initialQuery ? selectedLocationFromForecastQuery(initialQuery) : null,
  );
  const [loaded, setLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [horizon, setHorizon] = useState<ForecastHorizon>(initialQuery?.horizon ?? "72h");
  const [result, setResult] = useState<ForecastCalculationResult | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [places, setPlaces] = useState<SearchPlace[]>([]),
    [manual, setManual] = useState(false);
  const [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [manualName, setManualName] = useState("");
  const [date, setDate] = useState(""),
    [phase, setPhase] = useState<"sunrise" | "sunset">("sunset"),
    [reload, setReload] = useState(0);
  const [group, setGroup] = useState<HourlyColumnGroup>("common");
  const [layer, setLayer] = useState<"cloud" | "sunset">("cloud");
  const [mapPanel, setMapPanel] = useState<"forecast" | "places">("forecast");
  const [notice, setNotice] = useState("");
  const searchRequest = useRef(0);
  useEffect(() => {
    let saved = emptyLibrary;
    try {
      saved = parseLocalLibrary(localStorage.getItem(freeStorageKey));
    } catch {
      /* Storage may be disabled by the browser. */
    }
    setLibrary(saved);
    if (!initialQuery) setLocation(saved.recent[0] ?? null);
    setLoaded(true);
  }, [initialQuery]);
  function persist(next: LocalWeatherLibrary) {
    setLibrary(next);
    try {
      localStorage.setItem(freeStorageKey, JSON.stringify(next));
      setNotice("");
    } catch {
      setNotice("浏览器未允许保存，收藏仅在当前页面有效。");
    }
  }
  function choose(next: SelectedLocation) {
    searchRequest.current++;
    setSearchOpen(false);
    setSearching(false);
    setLocation(next);
    setMapPanel("forecast");
    persist(addRecent(library, next));
    setPlaces([]);
    setSearch("");
    setSearchError("");
    setManual(false);
  }
  useEffect(() => {
    if (!loaded || !location) return;
    const controller = new AbortController();
    setBusy(true);
    setResult(null);
    setError("");
    setDate("");
    const query = buildForecastRequestPayload(location, horizon, targets[view], {
      timezone: siteSettings.timezone,
    });
    requestForecastCalculation(query, { signal: controller.signal, forceRefresh: true, allowStaleFallback: false })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.isMock || data.weatherDataMode !== "real")
          throw new Error("气象服务尚未返回真实数据，请稍后重试。");
        setResult(data);
        setDate(data.targetDates[0] ?? "");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "预报暂时不可用，请重试。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [location, horizon, view, loaded, reload, siteSettings.timezone]);
  const refreshForecast = async () => { await refreshSiteSettings(); setReload((value) => value + 1); };
  const timezone = result?.calendarBasis.timezone ?? siteSettings.timezone;
  const dates = result?.targetDates ?? [];
  const rows = result ? hoursForDate(result, date, view === "stars") : [];
  const available = Boolean(result && scoreAvailable(result));
  const favored = Boolean(
    location && library.favorites.some((item) => locationKey(item) === locationKey(location)),
  );
  const mapPlaces = useMemo(() => {
    const all = [
      ...(location ? [location] : []),
      ...library.favorites,
      ...library.recent,
      ...presetLocations,
    ];
    return all
      .filter((item, i) => all.findIndex((other) => locationKey(other) === locationKey(item)) === i)
      .slice(0, 12);
  }, [location, library]);
  async function runSearch() {
    const query = search.trim();
    if (query.length < 2) {
      setSearchError("请输入至少两个字，或使用坐标查询。");
      return;
    }
    const request = ++searchRequest.current;
    setSearching(true);
    setSearchError("");
    setPlaces([]);
    try {
      const response = await publicApiFetch<{ results: SearchPlace[] }>(
        `/search/places?q=${encodeURIComponent(query)}`,
      );
      if (request !== searchRequest.current) return;
      setPlaces(response.results);
      if (!response.results.length) setSearchError("没有找到地点，试试附近城市，或输入坐标查询。");
    } catch {
      if (request === searchRequest.current)
        setSearchError("地点搜索暂时不可用，可选择下方地点或使用坐标查询。");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }
  function useCoordinates() {
    const latitude = Number(lat),
      longitude = Number(lng);
    if (
      !lat.trim() ||
      !lng.trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      setSearchError("请输入有效的 WGS84 纬度（−90～90）和经度（−180～180）。");
      return;
    }
    const selected = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: latitude,
      longitudeWgs84: longitude,
    });
    choose({
      ...selected,
      name: manualName.trim() || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      displayName: manualName.trim() || "坐标位置",
      source: "manual",
      originalSource: "manual",
      coordinateSource: "手动 WGS84 坐标",
    });
  }
  function locate() {
    if (!navigator.geolocation) {
      setSearchError("浏览器不支持定位，请使用坐标查询。");
      return;
    }
    setSearching(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearching(false);
        choose(
          selectedLocationFromBrowserGeolocation({
            latitudeWgs84: position.coords.latitude,
            longitudeWgs84: position.coords.longitude,
          }),
        );
      },
      () => {
        setSearching(false);
        setSearchError("未获得定位权限或定位失败，可使用坐标查询。");
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  return (
    <main className="pw-content pw-workbench">
      <section className="pw-query" aria-label="地点查询" hidden={Boolean(location && !searchOpen)}>
        <form
          className="pw-searchline"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <WeatherGlyph name="pin" />
          <input
            aria-label="搜索城市或地点"
            value={search}
            onChange={(event) => {
              searchRequest.current++;
              setSearching(false);
              setSearch(event.target.value);
            }}
            placeholder="搜索城市或地点…"
            maxLength={80}
          />
          <button
            type="button"
            className="pw-iconbutton"
            onClick={locate}
            disabled={searching}
            aria-label="使用当前位置"
          >
            <WeatherGlyph name="map" />
          </button>
          <button className="pw-searchbutton" disabled={searching}>
            {searching ? "查找中…" : "查询"}
          </button>
        </form>
        <div className="pw-query-options">
          <button type="button" onClick={() => setManual(!manual)} aria-expanded={manual}>
            坐标查询
          </button>
          {!location && (
            <label>
              预报范围{" "}
              <select
                aria-label="预报范围"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as ForecastHorizon)}
              >
                <option value="24h">未来 24 小时</option>
                <option value="48h">未来 48 小时</option>
                <option value="72h">未来 3 天</option>
                <option value="7d">未来 7 天</option>
              </select>
            </label>
          )}
          <Link href="/map">地点地图</Link>
        </div>
        {manual && (
          <div className="pw-coordinate-form">
            <label>
              地点名
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="可选"
                maxLength={80}
              />
            </label>
            <label>
              纬度
              <input
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="33.7852"
              />
            </label>
            <label>
              经度
              <input
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="111.6402"
              />
            </label>
            <button type="button" className="pw-softbutton" onClick={useCoordinates}>
              查询此坐标
            </button>
          </div>
        )}
        {searchError && (
          <p className="pw-error" role="alert">
            {searchError}
          </p>
        )}
        {places.length > 0 && (
          <ul className="pw-searchresults">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() =>
                    choose({
                      ...selectedLocationFromSearchResult(place),
                      coordinateSource: "Open-Meteo 地点坐标",
                    })
                  }
                >
                  <strong>{place.name}</strong>
                  <span>
                    {place.address || [place.province, place.city].filter(Boolean).join(" · ")}
                  </span>
                  <small>
                    {place.latitudeWgs84.toFixed(3)}, {place.longitudeWgs84.toFixed(3)} · Open-Meteo
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pw-quickplaces">
          <span>{library.recent.length ? "最近" : "快速选择"}</span>
          {(library.recent.length ? library.recent : presetLocations).slice(0, 4).map((item) => (
            <button type="button" key={locationKey(item)} onClick={() => choose(item)}>
              {item.name}
            </button>
          ))}
        </div>
        {library.favorites.length > 0 && (
          <div className="pw-quickplaces">
            <span>本机收藏</span>
            {library.favorites.map((item) => (
              <button type="button" key={locationKey(item)} onClick={() => choose(item)}>
                ☆ {item.name}
              </button>
            ))}
          </div>
        )}
      </section>
      {location && (
        <div className="pw-locationbar">
          <button
            type="button"
            className="pw-location pw-location-toggle"
            aria-label="更换地点"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <WeatherGlyph name="pin" />
            <div>
              <strong>
                {location.name} <span className="pw-change-label">更换⌄</span>
              </strong>
              <small>
                纬度 {location.latitudeWgs84.toFixed(4)}° / 经度{" "}
                {location.longitudeWgs84.toFixed(4)}° ·{" "}
                {location.originalSource === "local_preset"
                  ? "示例坐标，仅供参考"
                  : location.coordinateSource}
              </small>
            </div>
          </button>
          <div className="pw-location-actions">
            <select
              aria-label="预报范围"
              value={horizon}
              onChange={(event) => setHorizon(event.target.value as ForecastHorizon)}
            >
              <option value="24h">24 小时</option>
              <option value="48h">48 小时</option>
              <option value="72h">未来 3 天</option>
              <option value="7d">未来 7 天</option>
            </select>
            <button
              className="pw-iconbutton pw-favorite"
              type="button"
              aria-label={favored ? "取消收藏当前地点" : "收藏当前地点"}
              aria-pressed={favored}
              onClick={() => persist(toggleFavorite(library, location))}
            >
              <WeatherGlyph name="star" />
              <span>{favored ? "已收藏" : "收藏"}</span>
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="pw-muted-note">
          {notice}
        </p>
      )}
      <div className="pw-pageheading">
        <div>
          <p className="pw-eyebrow">{headings[view][0]}</p>
          <h1>{headings[view][1]}</h1>
        </div>
        {result && (
          <div className="pw-date-tabs" aria-label="预报日期">
            {dates.map((day) => (
              <button
                type="button"
                key={day}
                aria-pressed={day === date}
                onClick={() => setDate(day)}
              >
                {day.slice(5).replace("-", "/")}
              </button>
            ))}
          </div>
        )}
      </div>
      {!location && view !== "map" && (
        <section className="pw-panel pw-empty">
          <WeatherGlyph name={view === "stars" ? "stars" : "sunset"} />
          <h2>选择地点，查看预报</h2>
          <p>朝霞、晚霞、云海与星空，所有预报免费开放。</p>
          <div className="pw-empty-picks">
            {presetLocations.map((item) => (
              <button
                type="button"
                className="pw-softbutton"
                key={item.id}
                onClick={() => choose(item)}
              >
                {item.name} <WeatherGlyph name="arrow" />
              </button>
            ))}
          </div>
          <p className="pw-muted-note">示例地点的位置仅供参考。收藏保存在当前浏览器。</p>
        </section>
      )}
      {busy && view !== "map" && (
        <section className="pw-panel pw-loading" role="status">
          <span className="pw-spinner" />
          <h2>正在获取预报</h2>
          <p>首次查询可能需要稍等片刻。</p>
        </section>
      )}
      {error && (
        <section className="pw-panel pw-error" role="alert">
          <h2>暂时没能获取这次预报</h2>
          <p>{error}</p>
          <button
            type="button"
            className="pw-softbutton"
            onClick={() => void refreshForecast()}
          >
            重新获取
          </button>
        </section>
      )}
      {view === "map" && (
        <>
          <div className="pw-map-options">
            {" "}
            <div className="pw-map-layers">
              <span>查看条件</span>
              <button
                type="button"
                aria-pressed={layer === "cloud"}
                onClick={() => setLayer("cloud")}
              >
                云海
              </button>
              <button
                type="button"
                aria-pressed={layer === "sunset"}
                onClick={() => setLayer("sunset")}
              >
                晚霞
              </button>
            </div>
            <div className="pw-map-panel-tabs" aria-label="地图信息面板">
              <button
                type="button"
                aria-pressed={mapPanel === "forecast"}
                onClick={() => setMapPanel("forecast")}
              >
                拍摄预报
              </button>
              <button
                type="button"
                aria-pressed={mapPanel === "places"}
                onClick={() => setMapPanel("places")}
              >
                地点列表 · {mapPlaces.length}
              </button>
            </div>
          </div>
          <div className={`pw-map-layout pw-live-map-layout show-${mapPanel}`}>
            <aside className="pw-panel pw-place-list">
              <h3>地点列表</h3>
              <p>收藏、最近查询与示例地点</p>
              {mapPlaces.map((item, index) => (
                <button
                  type="button"
                  className="pw-place"
                  key={locationKey(item)}
                  aria-pressed={Boolean(location && locationKey(location) === locationKey(item))}
                  onClick={() => choose(item)}
                >
                  <span>
                    <WeatherGlyph name="pin" />
                    <b>
                      {index + 1}. {item.name}
                    </b>
                  </span>
                  <small>
                    {item.latitudeWgs84.toFixed(3)}, {item.longitudeWgs84.toFixed(3)}
                  </small>
                  <strong>
                    {location && locationKey(location) === locationKey(item)
                      ? "正在查看"
                      : "点击获取预报"}
                  </strong>
                </button>
              ))}
            </aside>
            <CloudSeaMap places={mapPlaces} selected={location} onSelect={choose} />
            {result ? (
              <CloudDetail result={result} date={date} layer={layer} />
            ) : (
              <aside className="pw-panel pw-map-detail">
                <h3>{busy ? "正在获取此处预报…" : "选择地点，查看预报"}</h3>
                <p>
                  {busy
                    ? "地图可以继续浏览，预报就绪后会显示在这里。"
                    : "在地图上点选位置，或从列表选择地点。"}
                </p>
              </aside>
            )}
          </div>
        </>
      )}

      {result && (
        <>
          <DataStatus result={result} />
          {view === "sun" && (
            <>
              <div className="pw-sun-switch" aria-label="朝晚霞切换">
                <button
                  type="button"
                  aria-pressed={phase === "sunrise"}
                  onClick={() => setPhase("sunrise")}
                >
                  朝霞
                </button>
                <button
                  type="button"
                  aria-pressed={phase === "sunset"}
                  onClick={() => setPhase("sunset")}
                >
                  晚霞
                </button>
              </div>
              <div className={`pw-sun-grid pw-phase-${phase}`}>
                <GlowCard result={result} date={date} phase="sunrise" />
                <GlowCard result={result} date={date} phase="sunset" />
              </div>
              <div className="pw-after-grid">
                <article className="pw-panel pw-night-teaser">
                  <div>
                    <div className="pw-overline">
                      <WeatherGlyph name="moon" />
                      拍完晚霞，再看看星空
                    </div>
                    <h3>
                      {available
                        ? result.astroAnalysis.dailyAstro.find((item) => item.date === date)
                            ?.recommendationLabel ?? "星空条件待确认"
                        : "星空条件待确认"}
                    </h3>
                    <p>{result.astroDataSourceLabelZh}</p>
                  </div>
                  <Link href="/astro" className="pw-softbutton">
                    查看星空详情 <WeatherGlyph name="arrow" />
                  </Link>
                </article>
                <CurrentWeather result={result} compact />
              </div>
              <div className="pw-sectiontitle">
                <h3>未来几天</h3>
                <span>观赏评分 / 100</span>
              </div>
              <div
                className="pw-outlook"
                style={{
                  gridTemplateColumns: `50px repeat(${Math.max(1, dates.length)},minmax(42px,1fr))`,
                }}
              >
                <div className="pw-outlook-head">
                  <span>日期</span>
                  <span>朝霞</span>
                  <span>晚霞</span>
                </div>
                {dates.map((day) => {
                  return (
                    <button
                      type="button"
                      className="pw-outlook-day"
                      aria-pressed={date === day}
                      key={day}
                      onClick={() => setDate(day)}
                    >
                      <b>{day.slice(5)}</b>
                      <span>{n(glowScore(result, day, "sunrise"))}</span>
                      <span className="pw-warm">{n(glowScore(result, day, "sunset"))}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {view === "stars" && <StarDetails result={result} date={date} rows={rows} />}
          {view === "weather" && (
            <>
              <div className="pw-weather-grid">
                <CurrentWeather result={result} />
                <DailyWeather result={result} />
              </div>
              <WeatherDaySummary rows={rows} />
            </>
          )}
          <section className="pw-panel pw-professional">
            <div className="pw-sectiontitle">
              <h3>{view === "stars" ? "整晚气象详情" : "逐小时气象详情"}</h3>
              <label>
                指标{" "}
                <select
                  aria-label="小时指标组"
                  value={group}
                  onChange={(event) => setGroup(event.target.value as HourlyColumnGroup)}
                >
                  {hourlyColumnGroups.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {rows.length ? (
              <HourlyWeatherMatrix
                rows={rows}
                timezone={timezone}
                config={hourlyColumnVisibility(group)}
                temperatureLabel="温度"
                showRawTemperature={false}
              />
            ) : (
              <p>所选日期暂无逐小时预报。</p>
            )}
          </section>
          <div className="pw-report-actions">
            <ReportShareButton
              document={{ ...buildShareDocument(result, buildPhotographyOutlook(result)), siteName: siteSettings.name }}
            />
            {location && (
              <Link
                className="pw-softbutton"
                href={buildForecastUrlFromSelectedLocation(location, horizon, targets[view], { timezone })}
              >
                完整分析报告 <WeatherGlyph name="arrow" />
              </Link>
            )}
            <button
              type="button"
              className="pw-softbutton"
              onClick={() => void refreshForecast()}
            >
              更新预报
            </button>
          </div>
          <details className="pw-panel pw-source-details">
            <summary>数据来源与预报说明</summary>
            <p>{result.weatherNoticeZh}</p>
            <p>{result.astroDataSourceLabelZh}</p>
            <p>{result.terrainSummary.dataSourceLabelZh}</p>
            {result.weatherSourceSummaries.map((source, index) => (
              <p key={`${source.providerCode}:${index}`}>
                {source.providerLabelZh} ·{" "}
                {
                  {
                    available: "可用",
                    failed: "暂不可用",
                    fallback: "备用数据",
                    skipped: "未使用",
                  }[source.status]
                }{" "}
                · {source.messageZh}
              </p>
            ))}
            {result.weatherMissingDataNotes.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </details>
        </>
      )}
    </main>
  );
}

function DataStatus({ result }: { readonly result: ForecastCalculationResult }) {
  const good = scoreAvailable(result);
  return (
    <div className={`pw-datastatus ${good ? "" : "pw-datawarning"}`} role="status">
      <span>{good ? "气象预报" : "资料不足 · 暂无评分"}</span>
      <span>
        {[
          ...new Set(
            result.weatherSourceSummaries
              .filter((source) => source.status === "available")
              .map((source) =>
                source.providerCode === "qweather"
                  ? "和风天气"
                  : source.providerCode === "open_meteo"
                    ? "Open-Meteo"
                    : source.providerLabelZh,
              ),
          ),
        ].join(" · ")}
      </span>
      <span>更新 {localTime(result.generatedAt, result.calendarBasis.timezone)}</span>
      {result.weatherDataFreshness === "stale" && <strong>缓存数据已过期，请谨慎参考</strong>}
      {!good && <p>{result.weatherEvidenceReasonZh ?? result.weatherNoticeZh}</p>}
      {(result.weatherAlerts ?? []).map((alert) => (
        <p key={alert.title}>{alert.title}</p>
      ))}
    </div>
  );
}

function GlowCard({
  result,
  date,
  phase,
}: {
  readonly result: ForecastCalculationResult;
  readonly date: string;
  readonly phase: "sunrise" | "sunset";
}) {
  const dawn = phase === "sunrise",
    day = result.glowAnalysis.dailyGlow.find((item) => item.date === date),
    astro = result.astroSummaries.find((item) => item.date === date),
    window = result.glowAnalysis.canonicalWindows.find(
      (item) => item.date === date && item.phase === phase,
    ),
    tz = result.calendarBasis.timezone;
  const event = window?.eventAt ?? (dawn ? astro?.sunrise : astro?.sunset);
  const score = glowScore(result, date, phase);
  const hours = hoursForDate(result, date).filter(
    (row) => event && Math.abs(Date.parse(row.time) - Date.parse(event)) < 90 * 60000,
  );
  const confidence = window?.confidence;
  return (
    <article className={`pw-sun-card ${dawn ? "pw-dawn" : "pw-dusk"}`} data-sun-card={phase}>
      <div className="pw-cardheading">
        <span className="pw-scene-icon">
          <WeatherGlyph name={phase} />
        </span>
        <div>
          <p className="pw-eyebrow">
            {date} · {dawn ? "清晨" : "傍晚"}
          </p>
          <h2>{dawn ? "朝霞" : "晚霞"}</h2>
        </div>
        <span className="pw-pill">
          {typeof score === "number"
            ? window?.recommendationLabel ?? day?.recommendationLabel ?? "条件评估"
            : "待确认"}
        </span>
      </div>
      <div className="pw-sun-verdict">
        <WeatherGlyph name="cloud" />
        <span>
          {typeof score === "number"
            ? day?.keyReason ?? "查看逐小时云层与通透度变化"
            : "该时段气象资料不足，暂不判断霞光条件"}
        </span>
      </div>
      <div className="pw-score-time">
        <div className="pw-score-ring" style={{ "--score": score ?? 0 } as CSSProperties}>
          <div>
            <strong>{n(score)}</strong>
            <small>/100</small>
            <span>观赏评分</span>
          </div>
        </div>
        <div className="pw-timeblock">
          <span>{dawn ? "日出" : "日落"}时间</span>
          <strong>{localTime(event, tz)}</strong>
          <div className="pw-timewindow">
            <span>建议观测时段</span>
            <b>{localWindow(window?.bestStartAt, window?.bestEndAt, tz)}</b>
          </div>
        </div>
      </div>
      <div className="pw-clouds">
        <span>
          低云 <b>{n(averageField(hours, "cloudLowPercent"), "%")}</b>
        </span>
        <span>
          中云 <b>{n(averageField(hours, "cloudMidPercent"), "%")}</b>
        </span>
        <span>
          高云 <b>{n(averageField(hours, "cloudHighPercent"), "%")}</b>
        </span>
      </div>
      <div className="pw-cardfoot">
        <span>
          <WeatherGlyph name="map" />
          方位 {n(dawn ? astro?.sunriseAzimuth : astro?.sunsetAzimuth, "°")}
        </span>
        <span>
          可信度{" "}
          <b>
            {confidence === undefined
              ? "待确认"
              : confidence >= 75
                ? "较高"
                : confidence >= 50
                  ? "中"
                  : "偏低"}
          </b>
        </span>
      </div>
      <details className="pw-reason">
        <summary>评分依据与注意事项</summary>
        <p>{day?.riskNote ?? window?.unavailableReason ?? "请结合现场云层变化判断。"}</p>
        <p>
          观赏评分表示条件适宜程度，不等于霞光发生概率。云量为事件附近预报时次的平均值；缺测显示 —。
        </p>
      </details>
    </article>
  );
}

function CurrentWeather({
  result,
  compact = false,
}: {
  readonly result: ForecastCalculationResult;
  readonly compact?: boolean;
}) {
  const current = result.currentWeather,
    first = result.professionalHourlyData?.[0];
  const temp = current?.temperature ?? first?.displayedTemperatureC,
    humidity = current?.humidity ?? first?.relativeHumidityPercent,
    wind = current?.windSpeed ?? first?.windSpeedMs;
  return (
    <article className={`pw-panel ${compact ? "pw-weather-teaser" : "pw-weather-now"}`}>
      <div className="pw-overline">
        {current?.dataKind === "observation" ? "当前观测" : "最近时次预报"}
      </div>
      <div className="pw-weather-big">
        <WeatherGlyph
          name={
            (current?.weatherTextZh ?? first?.weatherText ?? "").includes("晴") ? "sun" : "cloud"
          }
        />
        <strong>
          {n(temp)}
          <span>°C</span>
        </strong>
      </div>
      <h2>{current?.weatherTextZh ?? first?.weatherText ?? "天气资料"}</h2>
      <p>{localTime(current?.observedAt ?? first?.time, result.calendarBasis.timezone)}</p>
      <div className="pw-weather-factors">
        <div>
          <WeatherGlyph name="cloud" />
          <span>湿度</span>
          <b>{n(humidity, "%")}</b>
        </div>
        <div>
          <WeatherGlyph name="wind" />
          <span>风速</span>
          <b>{n(wind, " m/s", 1)}</b>
        </div>
        {!compact && (
          <>
            <div>
              <WeatherGlyph name="map" />
              <span>能见度</span>
              <b>
                {n(
                  current?.visibility ??
                    (first?.visibilityMeters == null ? null : first.visibilityMeters / 1000),
                  " km",
                  1,
                )}
              </b>
            </div>
            <div>
              <WeatherGlyph name="cloud" />
              <span>降水概率</span>
              <b>{n(first?.precipitationProbabilityPercent, "%")}</b>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function StarDetails({
  result,
  date,
  rows,
}: {
  readonly result: ForecastCalculationResult;
  readonly date: string;
  readonly rows: readonly ProfessionalHourlyDataPoint[];
}) {
  const day = result.astroAnalysis.dailyAstro.find((item) => item.date === date),
    astro = result.astroSummaries.find((item) => item.date === date),
    tz = result.calendarBasis.timezone,
    window = day?.recommendedMilkyWayWindow,
    score = scoreAvailable(result) ? day?.starsScore : undefined;
  return (
    <>
      <div className="pw-star-hero">
        <article className="pw-panel pw-star-summary">
          <div className="pw-overline">
            <WeatherGlyph name="stars" />
            观星条件 · {date} 夜间
          </div>
          <div className="pw-star-score">
            <strong>{n(score)}</strong>
            <span>
              /100
              <br />
              <b>{typeof score === "number" ? day?.recommendationLabel : "气象条件待确认"}</b>
            </span>
          </div>
          <h3>{day?.keyReason ?? "此日期暂无完整星空判断"}</h3>
          <p>{day?.riskNote}</p>
          <div className="pw-stargap">
            <WeatherGlyph name="clock" />
            <div>
              <span>推荐银河窗口</span>
              <strong>{window ? localWindow(window.start, window.end, tz) : "暂无推荐窗口"}</strong>
            </div>
          </div>
          <p className="pw-muted-note">
            银河拍摄还需考虑银河位置和月光；普通观星请参考下方黑夜时段。
          </p>
        </article>
        <article className="pw-panel pw-moon-panel">
          <div className="pw-sectiontitle">
            <h3>月光与黑夜</h3>
            <WeatherGlyph name="moon" />
          </div>
          <div className="pw-moon-row">
            <WeatherGlyph name="moon" style={{ width: 54, height: 54 }} />
            <div>
              <strong>{astro?.moonPhaseNameZh ?? "月相待计算"}</strong>
              <p>
                月面照明{" "}
                {n(astro?.moonIllumination == null ? null : astro.moonIllumination * 100, "%")}
              </p>
            </div>
          </div>
          {[
            ["天文暮光结束", astro?.astronomicalDusk],
            ["月落时间", nightEvent(result, date, "moonset")],
            ["天文晨光开始", nightEvent(result, date, "astronomicalDawn")],
          ].map(([label, time]) => (
            <div className="pw-pairline" key={label}>
              <span>{label}</span>
              <b>{nightTime(time, date, tz)}</b>
            </div>
          ))}
          <p className="pw-muted-note">{result.astroDataSourceLabelZh}</p>
        </article>
      </div>
      <article className="pw-panel pw-nightchart">
        <div className="pw-sectiontitle">
          <h3>这一晚的天文窗口</h3>
          <span>跨夜时间标注“次日”</span>
        </div>
        {[
          ["天文黑夜", day?.astronomicalNightWindow],
          ["无月 / 低月光", day?.moonlessNightWindow],
          ["银河拍摄", window],
        ].map(([label, raw]) => {
          const item = typeof raw === "object" ? raw : undefined;
          return (
            <div className="pw-pairline" key={String(label)}>
              <span>{String(label)}</span>
              <b>
                {item
                  ? `${weatherDateKey(item.start, tz) !== date ? "次日 " : ""}${localWindow(item.start, item.end, tz)}`
                  : "暂无可用窗口"}
              </b>
            </div>
          );
        })}
        <p className="pw-muted-note">
          {day?.moonlessNightWindow?.noteZh ?? "低月光窗口还需结合月亮高度与照明比例判断。"}
          {result.astroDataSourceLabelZh.includes("估算") &&
            " 当前为简化估算，窗口边界不代表精确月落时刻。"}
        </p>
      </article>
      <div className="pw-star-detail-grid">
        <article className="pw-panel">
          <h3>逐小时观测条件</h3>
          <p className="pw-muted-note">当日中午至次日中午，便于完整查看夜间变化。</p>
          <div className="pw-hourly-table">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>云量</th>
                  <th>温度</th>
                  <th>湿度</th>
                  <th>阵风</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((_, i) => i % 2 === 0)
                  .map((row) => (
                    <tr key={row.time}>
                      <td>
                        {localTime(row.time, tz)}
                        {weatherDateKey(row.time, tz) !== date && <small>次日</small>}
                      </td>
                      <td>{n(row.cloudTotalPercent, "%")}</td>
                      <td>{n(row.displayedTemperatureC, "°")}</td>
                      <td>{n(row.relativeHumidityPercent, "%")}</td>
                      <td>{n(row.windGustMs, " m/s", 1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="pw-panel">
          <h3>评分与拍摄准备</h3>
          {[
            ["天气条件", day?.skyConditionScore],
            ["天文窗口", day?.astronomicalWindowScore],
            ["银河位置", day?.milkyWayGeometryScore],
          ].map(([label, value]) => (
            <div className="pw-factor" key={String(label)}>
              <span>{String(label)}</span>
              <b>{scoreAvailable(result) ? n(typeof value === "number" ? value : null) : "—"}</b>
              <div>
                <i
                  style={{
                    width: `${scoreAvailable(result) && typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <p className="pw-muted-note">{day?.warmthAdviceZh}</p>
          {day?.gearAdviceZh.map((text, i) => (
            <p className="pw-muted-note" key={i}>
              {text}
            </p>
          ))}
          <p className="pw-muted-note">请另行确认当地光污染、山体遮挡和通行条件。</p>
        </article>
      </div>
    </>
  );
}

export function CloudDetail({
  result,
  date,
  layer,
}: {
  readonly result: ForecastCalculationResult;
  readonly date: string;
  readonly layer: "cloud" | "sunset";
}) {
  const day = result.cloudSeaAnalysis.dailyCloudSea.find((item) => item.date === date),
    glow = result.glowAnalysis.dailyGlow.find((item) => item.date === date),
    sunset = result.glowAnalysis.canonicalWindows.find(
      (item) => item.date === date && item.phase === "sunset",
    ),
    score = scoreAvailable(result)
      ? layer === "cloud"
        ? day?.shootableScore ?? day?.opportunityScore
        : glowScore(result, date, "sunset")
      : undefined;
  return (
    <aside className="pw-panel pw-map-detail">
      <div className="pw-overline">
        <WeatherGlyph name="pin" />
        已选地点 · {date}
      </div>
      <h2>{result.place.name}</h2>
      <p>{layer === "cloud" ? day?.keyReason : glow?.keyReason}</p>
      <div className="pw-map-score">
        <strong>{n(score)}</strong>
        <span>
          /100
          <br />
          {layer === "cloud" ? "云海拍摄" : "晚霞观赏"}评分
        </span>
      </div>
      <span className="pw-pill">
        {typeof score === "number"
          ? layer === "cloud"
            ? day?.recommendationLabel
            : sunset?.recommendationLabel
          : "资料不足"}
      </span>
      <div className="pw-map-window">
        <span>最佳窗口</span>
        <strong>
          {layer === "cloud"
            ? localWindow(
                day?.bestWindow.startTime,
                day?.bestWindow.endTime,
                result.calendarBasis.timezone,
              )
            : localWindow(
                result.glowAnalysis.canonicalWindows.find(
                  (w) => w.date === date && w.phase === "sunset",
                )?.bestStartAt,
                result.glowAnalysis.canonicalWindows.find(
                  (w) => w.date === date && w.phase === "sunset",
                )?.bestEndAt,
                result.calendarBasis.timezone,
              )}
        </strong>
      </div>
      {layer === "cloud" && (
        <div className="pw-pairline">
          <span>白墙风险</span>
          <b>{scoreAvailable(result) ? n(day?.whiteoutRiskScore, " /100") : "—"}</b>
        </div>
      )}
      <p className="pw-muted-note">{layer === "cloud" ? day?.riskNote : glow?.riskNote}</p>
      <details className="pw-reason">
        <summary>形成条件与不确定性</summary>
        {(layer === "cloud"
          ? result.cloudSeaAnalysis.missingDataNotes
          : result.glowAnalysis.missingDataNotes
        ).map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </details>
      <Link href="/" className="pw-mainbutton">
        查看朝霞与晚霞
      </Link>
    </aside>
  );
}

function WeatherDaySummary({ rows }: { readonly rows: readonly ProfessionalHourlyDataPoint[] }) {
  const data = summarizeWeatherHours(rows);
  return (
    <article className="pw-panel pw-hourstrip">
      <div className="pw-sectiontitle">
        <h3>所选日期气象摘要</h3>
        <span>{rows.length} 个预报时次</span>
      </div>
      <div className="pw-summary-grid">
        <div>
          <span>温度范围</span>
          <strong>
            {n(data.minTemperature, "°")}–{n(data.maxTemperature, "°")}
          </strong>
        </div>
        <div>
          <span>最大风速</span>
          <strong>{n(data.maxWind, " m/s", 1)}</strong>
        </div>
        <div>
          <span>最大阵风</span>
          <strong>{n(data.maxGust, " m/s", 1)}</strong>
        </div>
        <div>
          <span>最低能见度</span>
          <strong>
            {n(data.minVisibility == null ? null : data.minVisibility / 1000, " km", 1)}
          </strong>
        </div>
      </div>
    </article>
  );
}
function DailyWeather({ result }: { readonly result: ForecastCalculationResult }) {
  const days = result.targetDates.map((date) => ({
    date,
    rows: hoursForDate(result, date),
    ...summarizeWeatherHours(hoursForDate(result, date)),
  }));
  const temps = days
    .flatMap((day) => [day.minTemperature, day.maxTemperature])
    .filter((value): value is number => value !== null);
  const low = Math.min(...temps) - 1,
    range = Math.max(...temps) + 1 - low;
  return (
    <article className="pw-panel pw-week">
      <h3>逐日天气</h3>
      {days.map((day) => (
        <div className="pw-weekrow" key={day.date}>
          <b>{day.date.slice(5)}</b>
          <WeatherGlyph name="cloud" />
          <span>{n(day.minTemperature, "°")}</span>
          <div>
            {day.minTemperature !== null && day.maxTemperature !== null && (
              <i
                style={{
                  left: `${(100 * (day.minTemperature - low)) / range}%`,
                  width: `${(100 * (day.maxTemperature - day.minTemperature)) / range}%`,
                }}
              />
            )}
          </div>
          <strong>{n(day.maxTemperature, "°")}</strong>
          <small>{n(day.maxProbability, "%")}</small>
        </div>
      ))}
      <p className="pw-muted-note">
        按所选范围内的小时数据汇总，首尾日期可能不足 24
        小时。右侧是小时降水概率最大值，不代表整日概率。
      </p>
    </article>
  );
}
