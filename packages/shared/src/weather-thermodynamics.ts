/** Magnus approximation over liquid water; output is an estimate, not an observation. */
export function dewPointFromTemperatureHumidity(temperature: number, humidity: number): number {
  const gamma =
    Math.log(Math.min(100, Math.max(0.01, humidity)) / 100) +
    (17.625 * temperature) / (243.04 + temperature);
  return Math.round(((243.04 * gamma) / (17.625 - gamma)) * 10) / 10;
}
