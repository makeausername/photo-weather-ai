import type { PublicMapConfig } from "../lib/map-config";
import type { CircleMarker, LeafletMouseEvent } from "leaflet";
import type { SelectedLocation } from "./selected-location";
import { groupNearbyPins, locationFromMap, mapPoint } from "./map-locations";
import { locationKey } from "./free-weather-data";

export type MapEngine = {
  update(places: readonly SelectedLocation[], selected: SelectedLocation | null): void;
  focus(): void;
  fit(): void;
  zoom(delta: number): void;
  interact(enabled: boolean): void;
  resize(): void;
  clearCandidate(): void;
  destroy(): void;
};
type Events = {
  select(place: SelectedLocation): void;
  candidate(place: SelectedLocation): void;
  group(places: readonly SelectedLocation[]): void;
  status(error: string): void;
};

function pinContent(number: string, active: boolean, title: string) {
  const el = document.createElement("div");
  el.className = `pw-geo-pin${active ? " is-selected" : ""}`;
  el.textContent = number;
  el.title = title;
  return el;
}

export async function createOsmMap(
  container: HTMLElement,
  config: PublicMapConfig,
  events: Events,
): Promise<MapEngine> {
  const L = await import("leaflet");
  const map = L.map(container, {
    zoomControl: false,
    scrollWheelZoom: false,
    attributionControl: true,
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 18,
  }).setView([33.8, 111.6], 7);
  const credit = document.createElement("a");
  credit.href = config.tileAttributionUrl;
  credit.textContent = config.tileAttribution;
  credit.target = "_blank";
  credit.rel = "noopener noreferrer";
  const tiles = L.tileLayer(config.tileUrl, {
    attribution: credit.outerHTML,
    maxZoom: 19,
    keepBuffer: 1,
  }).addTo(map);
  let failed = false;
  tiles.on("loading", () => {
    failed = false;
  });
  tiles.on("tileerror", () => {
    failed = true;
    events.status("部分底图未加载，可重试或切换底图。");
  });
  tiles.on("load", () => {
    if (!failed) events.status("");
  });
  const pins = L.layerGroup().addTo(map);
  let places: readonly SelectedLocation[] = [];
  let selected: SelectedLocation | null = null;
  let selectedKey = "";
  let candidate: CircleMarker | null = null;
  const draw = () => {
    pins.clearLayers();
    const groups = groupNearbyPins(places, (place) =>
      map.latLngToContainerPoint([place.latitudeWgs84, place.longitudeWgs84]),
    );
    for (const group of groups) {
      const first = group.members[0]!;
      const active = group.members.some(
        (p) => selected && locationKey(p) === locationKey(selected),
      );
      const center = map.containerPointToLatLng([group.x, group.y]);
      const names = group.members.map((p) => p.name).join("、");
      const marker = L.marker(center, {
        title: names,
        alt: `选择${names}`,
        keyboard: true,
        zIndexOffset: active ? 1000 : 0,
        icon: L.divIcon({
          className: "pw-geo-marker",
          html: pinContent(
            group.members.length > 1
              ? `${group.members.length}处`
              : String(places.indexOf(first) + 1),
            active,
            names,
          ),
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(pins);
      marker.getElement()?.setAttribute("aria-label", `选择${names}`);
      marker.on("click", () =>
        group.members.length > 1 ? events.group(group.members) : events.select(first),
      );
    }
  };
  map.on("zoomend moveend", draw);
  map.on("click", (event: LeafletMouseEvent) => {
    candidate?.remove();
    candidate = L.circleMarker(event.latlng, {
      radius: 9,
      color: "#b6532a",
      fillColor: "#fff4de",
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
    events.candidate(
      locationFromMap({ latitude: event.latlng.lat, longitude: event.latlng.lng }, "osm"),
    );
  });
  const focus = () => {
    if (selected) map.setView([selected.latitudeWgs84, selected.longitudeWgs84], 10);
  };
  return {
    update(next, active) {
      places = next;
      selected = active;
      const key = active ? locationKey(active) : "";
      if (key !== selectedKey) {
        selectedKey = key;
        candidate?.remove();
        focus();
      }
      draw();
    },
    focus,
    fit() {
      if (places.length)
        map.fitBounds(
          places.map((p) => [p.latitudeWgs84, p.longitudeWgs84] as [number, number]),
          { padding: [45, 45], maxZoom: 12 },
        );
    },
    zoom(delta) {
      map.setZoom(map.getZoom() + delta);
    },
    interact(enabled) {
      for (const handler of [
        map.dragging,
        map.touchZoom,
        map.doubleClickZoom,
        map.boxZoom,
        map.keyboard,
      ])
        enabled ? handler.enable() : handler.disable();
    },
    resize() {
      map.invalidateSize();
    },
    clearCandidate() {
      candidate?.remove();
      candidate = null;
    },
    destroy() {
      map.remove();
    },
  };
}

type AmapSdk = {
  Map: new (container: HTMLElement, options: object) => any;
  Marker: new (options: object) => any;
  Pixel: new (x: number, y: number) => any;
  LngLat: new (longitude: number, latitude: number) => any;
};
declare global {
  interface Window {
    AMap?: AmapSdk;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}
let sdkPromise: Promise<AmapSdk> | null = null;
function loadAmap(config: PublicMapConfig) {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (sdkPromise) return sdkPromise;
  window._AMapSecurityConfig = {
    serviceHost: `${window.location.origin}${config.amapServiceHost}`,
  };
  sdkPromise = new Promise<AmapSdk>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error("高德地图加载失败，请使用基础底图或重试。"));
    };
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.amapKey!)}`;
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timeout);
      if (window.AMap) resolve(window.AMap);
      else fail();
    };
    document.head.append(script);
  });
  return sdkPromise;
}

export async function createAmap(
  container: HTMLElement,
  config: PublicMapConfig,
  events: Events,
): Promise<MapEngine> {
  const AMap = await loadAmap(config);
  const map = new AMap.Map(container, {
    zoom: 7,
    center: [111.6, 33.8],
    viewMode: "2D",
    resizeEnable: true,
    scrollWheel: false,
    showLabel: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      map.destroy();
      reject(new Error("高德底图加载超时"));
    }, 20000);
    map.on("complete", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  let places: readonly SelectedLocation[] = [];
  let selected: SelectedLocation | null = null;
  let key = "";
  let markers: any[] = [];
  let candidate: any = null;
  const position = (place: SelectedLocation) => {
    const p = mapPoint(place, "amap");
    return [p.longitude, p.latitude];
  };
  const draw = () => {
    map.remove(markers);
    markers = [];
    for (const group of groupNearbyPins(places, (place) => {
      const p = position(place);
      const px = map.lngLatToContainer(new AMap.LngLat(p[0]!, p[1]!));
      return { x: px.x, y: px.y };
    })) {
      const first = group.members[0]!;
      const names = group.members.map((p) => p.name).join("、");
      const active = group.members.some(
        (p) => selected && locationKey(p) === locationKey(selected),
      );
      const content = pinContent(
        group.members.length > 1 ? `${group.members.length}处` : String(places.indexOf(first) + 1),
        active,
        names,
      );
      content.setAttribute("role", "button");
      content.setAttribute("aria-label", `选择${names}`);
      content.tabIndex = 0;
      const choose = () =>
        group.members.length > 1 ? events.group(group.members) : events.select(first);
      content.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      });
      const marker = new AMap.Marker({
        position: position(first),
        content,
        offset: new AMap.Pixel(-22, -22),
        bubble: false,
        zIndex: active ? 200 : 100,
      });
      marker.on("click", choose);
      markers.push(marker);
    }
    map.add(markers);
  };
  map.on("zoomend", draw);
  map.on("moveend", draw);
  map.on("complete", () => events.status(""));
  map.on("click", (e: { lnglat: { getLat(): number; getLng(): number } }) => {
    if (candidate) map.remove(candidate);
    candidate = new AMap.Marker({
      position: [e.lnglat.getLng(), e.lnglat.getLat()],
      content: pinContent("＋", true, "待选位置"),
      offset: new AMap.Pixel(-22, -22),
    });
    map.add(candidate);
    events.candidate(
      locationFromMap({ latitude: e.lnglat.getLat(), longitude: e.lnglat.getLng() }, "amap"),
    );
  });
  const focus = () => {
    if (selected) map.setZoomAndCenter(10, position(selected));
  };
  return {
    update(next, active) {
      places = next;
      selected = active;
      const nextKey = active ? locationKey(active) : "";
      if (key !== nextKey) {
        key = nextKey;
        if (candidate) map.remove(candidate);
        focus();
      }
      draw();
    },
    focus,
    fit() {
      if (markers.length) map.setFitView(markers, false, [45, 45, 45, 45], 12);
    },
    zoom(delta) {
      map.setZoom(map.getZoom() + delta);
    },
    interact(enabled) {
      map.setStatus({
        dragEnable: enabled,
        zoomEnable: enabled,
        doubleClickZoom: enabled,
        keyboardEnable: enabled,
      });
    },
    resize() {
      map.resize?.();
    },
    clearCandidate() {
      if (candidate) map.remove(candidate);
      candidate = null;
    },
    destroy() {
      map.destroy();
    },
  };
}
