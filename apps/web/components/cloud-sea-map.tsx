"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicMapConfig } from "../lib/map-config";
import { createAmap, createOsmMap, type MapEngine } from "./map-engines";
import type { SelectedLocation } from "./selected-location";
import { publicApiFetch } from "./api-client";
import { locationKey } from "./free-weather-data";

export function CloudSeaMap({
  places,
  selected,
  onSelect,
}: {
  readonly places: readonly SelectedLocation[];
  readonly selected: SelectedLocation | null;
  readonly onSelect: (place: SelectedLocation) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const latest = useRef({ places, selected, onSelect });
  latest.current = { places, selected, onSelect };
  const [config, setConfig] = useState<PublicMapConfig | null>(null);
  const provider = config?.provider ?? "amap";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [candidate, setCandidate] = useState<SelectedLocation | null>(null);
  const [group, setGroup] = useState<readonly SelectedLocation[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    publicApiFetch<PublicMapConfig>("/maps/config", { signal: controller.signal })
      .then((value) => {
        setConfig(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("底图配置暂时不可用，请重试。");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!container.current || !config) return;
    if (provider === "amap" && !config.amapKey) {
      setLoading(false);
      setError("地图暂未配置，仍可从地点列表查询预报。");
      return;
    }
    let disposed = false;
    let instance: MapEngine | null = null;
    let observer: ResizeObserver | null = null;
    setLoading(true);
    setError("");
    setGroup([]);
    setCandidate(null);
    engine.current?.clearCandidate();
    const events = {
      select: (place: SelectedLocation) => {
        setGroup([]);
        setCandidate(null);
        engine.current?.clearCandidate();
        latest.current.onSelect(place);
      },
      candidate: (place: SelectedLocation) => {
        setGroup([]);
        setCandidate(place);
      },
      group: (value: readonly SelectedLocation[]) => {
        setCandidate(null);
        engine.current?.clearCandidate();
        setGroup(value);
      },
      status: (message: string) => {
        if (!disposed) setError(message);
      },
    };
    const create = provider === "amap" ? createAmap : createOsmMap;
    create(container.current, config, events)
      .then((map) => {
        if (disposed) {
          map.destroy();
          return;
        }
        instance = map;
        engine.current = map;
        map.update(latest.current.places, latest.current.selected);
        map.interact(true);
        observer = new ResizeObserver(() => {
          map.resize();
          map.interact(true);
        });
        observer.observe(container.current!);
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setError("底图加载失败，请稍后重试；仍可从地点列表查询预报。");
        }
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      instance?.destroy();
      engine.current = null;
    };
  }, [config, provider]);
  useEffect(() => {
    engine.current?.update(places, selected);
    setCandidate(null);
    engine.current?.clearCandidate();
    setGroup([]);
  }, [places, selected]);

  return (
    <section className="pw-real-map" aria-label="云海地点地图">
      <div className="pw-map-viewport">
        <div ref={container} className="pw-map-surface" aria-label="可缩放的地理底图" />
        <div className="pw-map-instructions">点选位置 · 查看预报</div>
        <div className="pw-map-tools">
          <button type="button" aria-label="放大地图" onClick={() => engine.current?.zoom(1)}>
            ＋
          </button>
          <button type="button" aria-label="缩小地图" onClick={() => engine.current?.zoom(-1)}>
            −
          </button>
          <button type="button" onClick={() => engine.current?.focus()} disabled={!selected}>
            回到
            <br />
            地点
          </button>
          <button type="button" onClick={() => engine.current?.fit()}>
            全部
            <br />
            地点
          </button>
        </div>
        {loading && (
          <div className="pw-map-feedback" role="status">
            正在加载地图…
          </div>
        )}
        {error && (
          <div className="pw-map-feedback" role="status">
            <span>{error}</span>
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              重试
            </button>
          </div>
        )}
      </div>
      {candidate && (
        <div className="pw-map-selection" role="status">
          <div>
            <b>已选地图位置</b>
            <small>
              纬度 {candidate.latitudeWgs84.toFixed(5)}° / 经度{" "}
              {candidate.longitudeWgs84.toFixed(5)}° · WGS84
            </small>
          </div>
          <button
            type="button"
            className="pw-mainbutton"
            onClick={() => {
              onSelect(candidate);
              setCandidate(null);
              engine.current?.clearCandidate();
            }}
          >
            查看此处预报
          </button>
          <button
            type="button"
            onClick={() => {
              setCandidate(null);
              engine.current?.clearCandidate();
            }}
          >
            取消
          </button>
        </div>
      )}
      {group.length > 0 && (
        <div className="pw-map-selection pw-map-group" aria-label="附近地点">
          <b>这些地点距离较近</b>
          <button type="button" onClick={() => setGroup([])}>
            收起
          </button>
          {group.map((place) => (
            <button
              type="button"
              key={locationKey(place)}
              onClick={() => {
                onSelect(place);
                setGroup([]);
              }}
            >
              {place.name}
            </button>
          ))}
        </div>
      )}
      <div className="pw-basemap-footer">
        <span>
          {!config
            ? "地理底图"
            : provider === "amap"
              ? "高德地图 · 地理底图"
              : "OpenStreetMap · 本地预览"}
        </span>
        <span>底图不代表实时云海范围</span>
      </div>
    </section>
  );
}
