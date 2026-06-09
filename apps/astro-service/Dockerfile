FROM python:3.12-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV EPHEMERIS_PATH=/app/data/de421.bsp
ENV LIGHT_POLLUTION_DATASET_PATH=/app/data/light-pollution/current/light-pollution.cog.tif
ENV LIGHT_POLLUTION_METADATA_PATH=/app/data/light-pollution/current/metadata.json
ENV LIGHT_POLLUTION_CACHE_SIZE=1024
ENV LIGHT_POLLUTION_QUERY_TIMEOUT_MS=5000

WORKDIR /app/apps/astro-service
ARG PIP_INDEX_URL=""

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libexpat1 libsqlite3-0 libtiff6 libcurl4 \
  && mkdir -p /app/data/light-pollution/current /app/data/light-pollution/incoming \
  && rm -rf /var/lib/apt/lists/*

COPY apps/astro-service/requirements.txt ./requirements.txt
RUN if [ -n "$PIP_INDEX_URL" ]; then \
    pip install --no-cache-dir -i "$PIP_INDEX_URL" -r requirements.txt; \
  else \
    pip install --no-cache-dir -r requirements.txt; \
  fi

COPY apps/astro-service/app ./app
COPY apps/astro-service/scripts ./scripts

EXPOSE 4100

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4100"]
