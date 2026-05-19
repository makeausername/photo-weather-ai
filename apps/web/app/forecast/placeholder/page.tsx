import { Card } from "../../../components/ui";

type ForecastPlaceholderPageProps = {
  readonly searchParams: {
    readonly placeId?: string;
  };
};

export default function ForecastPlaceholderPage({ searchParams }: ForecastPlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-3xl gap-5">
        <a href="/" className="text-sm font-semibold text-primary">
          返回逐光天气
        </a>
        <Card className="p-6 shadow-soft">
          <p className="text-sm font-semibold text-muted-foreground">拍摄天气分析</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-card-foreground">
            天气分析能力正在接入中
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            天气分析能力正在接入中，当前仅完成地点识别与机位匹配。
          </p>
          {searchParams.placeId ? (
            <p className="mt-4 break-words rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              已选择地点：{searchParams.placeId}
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
