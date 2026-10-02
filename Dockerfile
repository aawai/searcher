FROM denoland/deno:2.9.7 AS build

WORKDIR /app

COPY deno.jsonc deno.lock ./
RUN deno install --frozen

COPY src ./src
COPY web ./web

RUN deno task build


FROM denoland/deno:2.9.7 AS runtime-deps

WORKDIR /app

COPY deno.runtime.jsonc ./deno.jsonc
COPY deno.lock ./
COPY src ./src

RUN deno install \
    --frozen \
    --prod \
    --skip-types \
    --entrypoint src/main.ts src/commands/admin.ts


FROM denoland/deno:2.9.7 AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=34567 \
    DATABASE_PATH=/app/data/searcher.sqlite

COPY --from=runtime-deps /deno-dir /deno-dir
COPY --from=runtime-deps /app/deno.jsonc /app/deno.lock ./
COPY src ./src
COPY drizzle ./drizzle
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 34567

CMD ["run", "-A", "--cached-only", "src/main.ts"]
