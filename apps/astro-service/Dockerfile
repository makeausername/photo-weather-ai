FROM python:3.12-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/apps/astro-service

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY apps/astro-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/astro-service/app ./app
COPY apps/astro-service/scripts ./scripts

EXPOSE 4100

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4100"]
