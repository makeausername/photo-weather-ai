import type { ForecastCalculationResult } from "@photo-weather/shared";
import {
  CloudSeaProfessionalHourlyDataPanel,
  generalProfessionalHourlySectionConfig,
} from "../app/forecast/forecast-result-client";
import { buildGeneralProfessionalHourlyData } from "../app/forecast/forecast-result-view-model";
import { Card } from "./ui";

export function HomepageHourlyWeather({
  result,
}: {
  readonly result: ForecastCalculationResult;
}) {
  const data = buildGeneralProfessionalHourlyData(result);

  return (
    <Card className="min-w-0 p-5" data-homepage-hourly-weather="true">
      {data.rows.length === 0 ? (
        <p
          className="mt-4 rounded-lg border border-warning/40 bg-accent/10 px-3 py-3 text-sm leading-6 text-muted-foreground"
          data-homepage-hourly-empty="true"
        >
          本次综合判断没有返回可显示的小时数据，请重新分析或检查天气数据源状态。
        </p>
      ) : (
        <CloudSeaProfessionalHourlyDataPanel
          target="general"
          data={data}
          config={generalProfessionalHourlySectionConfig}
          variant="card"
        />
      )}
    </Card>
  );
}