export type WorkerRuntime = {
  readonly service: "photo-weather-worker";
  readonly queueMode: "placeholder";
};

export function createWorkerRuntime(): WorkerRuntime {
  return {
    service: "photo-weather-worker",
    queueMode: "placeholder",
  };
}

if (process.env.NODE_ENV !== "test") {
  const runtime = createWorkerRuntime();
  console.log(`${runtime.service} started in ${runtime.queueMode} mode`);
}
