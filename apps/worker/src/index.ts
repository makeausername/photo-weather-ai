export type WorkerRuntime = {
  readonly service: "photo-weather-worker";
  readonly queueMode: "placeholder";
  readonly forecastInterpretationRequired: false;
};

export function createWorkerRuntime(): WorkerRuntime {
  return {
    service: "photo-weather-worker",
    queueMode: "placeholder",
    forecastInterpretationRequired: false,
  };
}

export function startWorkerRuntime(runtime = createWorkerRuntime()): { readonly stop: () => void } {
  console.log(`${runtime.service} started in ${runtime.queueMode} mode`);
  console.log("Forecast calculation runs synchronously in the api service; no worker queue is required.");

  const keepAlive = setInterval(() => {
    console.log(`${runtime.service} idle heartbeat; no background queues are enabled.`);
  }, 60 * 60 * 1000);

  const stop = () => {
    clearInterval(keepAlive);
    console.log(`${runtime.service} stopped`);
  };

  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  return { stop };
}

if (process.env.NODE_ENV !== "test") {
  startWorkerRuntime();
}
