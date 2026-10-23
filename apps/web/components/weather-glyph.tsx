import type { CSSProperties } from "react";

export type WeatherGlyphName =
  | "sun"
  | "sunrise"
  | "sunset"
  | "moon"
  | "stars"
  | "map"
  | "pin"
  | "cloud"
  | "wind"
  | "clock"
  | "star"
  | "search"
  | "arrow";
const paths: Record<WeatherGlyphName, string> = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  sunrise:
    "M3 18h18M5 15a7 7 0 0 1 14 0M12 2v6m-3-3 3-3 3 3M2 12h2m16 0h2M4 5l2 2m12 0 2-2M3 21h18",
  sunset: "M3 18h18M5 15a7 7 0 0 1 14 0M12 2v6m-3-3 3 3 3-3M2 12h2m16 0h2M4 5l2 2m12 0 2-2M3 21h18",
  moon: "M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z",
  stars:
    "m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Zm7-1v4m-2-2h4M4 19v4m-2-2h4",
  map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  cloud: "M7 19h11a4 4 0 0 0 0-8h-1a6 6 0 0 0-12-1 4.5 4.5 0 0 0 2 9Z",
  wind: "M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 17h5a2 2 0 1 1-2 2",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
};
export function WeatherGlyph({
  name,
  style,
}: {
  readonly name: WeatherGlyphName;
  readonly style?: CSSProperties;
}) {
  return (
    <svg
      className="pw-icon"
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
