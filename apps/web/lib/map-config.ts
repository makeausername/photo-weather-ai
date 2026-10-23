export type PublicMapConfig = {
  provider: "osm" | "amap";
  amapKey: string | null;
  amapServiceHost: string;
  tileUrl: string;
  tileAttribution: string;
  tileAttributionUrl: string;
};
