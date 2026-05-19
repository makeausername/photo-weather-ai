import {
  forecastHorizonLabels,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import { Badge, Card } from "../../components/ui";

type ForecastPageProps = {
  readonly searchParams: Record<string, string | readonly string[] | undefined>;
};

const sourceLabels: Record<string, string> = {
  local_location: "本地地点",
  local_photo_spot: "本地机位",
  amap: "高德地图",
  mock: "模拟数据",
};

const futureModules = ["天气数据", "地形海拔", "日出日落", "月相与银河窗口", "摄影评分", "决策建议"] as const;

function firstParam(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.[0];
}

function parseNumberParam(value: string | undefined): number {
  return value === undefined || value.trim() === "" ? Number.NaN : Number(value);
}

function getSourceLabel(source: string): string {
  return sourceLabels[source] ?? "其他来源";
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

export default function ForecastPage({ searchParams }: ForecastPageProps) {
  const parsedQuery = forecastQueryInputSchema.safeParse({
    name: firstParam(searchParams.name),
    source: firstParam(searchParams.source),
    latitudeGcj02: parseNumberParam(firstParam(searchParams.lat)),
    longitudeGcj02: parseNumberParam(firstParam(searchParams.lng)),
    latitudeWgs84: parseNumberParam(firstParam(searchParams.latWgs84)),
    longitudeWgs84: parseNumberParam(firstParam(searchParams.lngWgs84)),
    horizon: firstParam(searchParams.horizon),
    target: firstParam(searchParams.target),
    locationId: firstParam(searchParams.locationId),
    photoSpotId: firstParam(searchParams.photoSpotId),
  });
  const query = parsedQuery.success ? parsedQuery.data : null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-4xl gap-5">
        <a href="/" className="text-sm font-semibold text-primary">
          返回逐光天气
        </a>

        <Card className="p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">当前为分析流程占位页</p>
              <h1 className="mt-2 text-2xl font-bold tracking-normal text-card-foreground">
                拍摄天气分析
              </h1>
            </div>
            <Badge variant={query ? "success" : "warning"}>
              {query ? "查询参数已确认" : "查询参数不完整"}
            </Badge>
          </div>

          <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
            天气数据、地形分析、天文窗口与智能解读将在后续步骤接入。当前仅完成地点识别与查询参数确认。
          </p>
        </Card>

        <Card className="p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-card-foreground">查询信息</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">地点信息</dt>
              <dd className="mt-1 font-semibold text-card-foreground">
                {query?.name ?? "未提供有效地点"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">数据来源</dt>
              <dd className="mt-1 font-semibold text-card-foreground">
                {query ? getSourceLabel(query.source) : "未提供"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">预报范围</dt>
              <dd className="mt-1 font-semibold text-card-foreground">
                {query ? forecastHorizonLabels[query.horizon] : "未选择"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">分析目标</dt>
              <dd className="mt-1 font-semibold text-card-foreground">
                {query ? forecastTargetLabels[query.target] : "未选择"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-muted-foreground">坐标信息</dt>
              <dd className="mt-1 grid gap-1 text-card-foreground">
                <span>
                  GCJ-02：{formatCoordinate(query?.latitudeGcj02 ?? Number.NaN)},{" "}
                  {formatCoordinate(query?.longitudeGcj02 ?? Number.NaN)}
                </span>
                <span>
                  WGS84：{formatCoordinate(query?.latitudeWgs84 ?? Number.NaN)},{" "}
                  {formatCoordinate(query?.longitudeWgs84 ?? Number.NaN)}
                </span>
              </dd>
            </div>
            {query?.locationId ? (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">本地地点编号</dt>
                <dd className="mt-1 break-words text-card-foreground">{query.locationId}</dd>
              </div>
            ) : null}
            {query?.photoSpotId ? (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">本地机位编号</dt>
                <dd className="mt-1 break-words text-card-foreground">{query.photoSpotId}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card className="p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-card-foreground">后续模块</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {futureModules.map((module) => (
              <div
                key={module}
                className="rounded-lg border border-dashed border-border bg-muted px-3 py-4 opacity-75"
              >
                <p className="font-semibold text-card-foreground">{module}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">后续接入</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
