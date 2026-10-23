FROM denoland/deno:2.9.7 AS build

WORKDIR /app

COPY deno.jsonc deno.lock ./
RUN deno install --frozen

COPY src ./src
COPY web ./web
COPY deno.runtime.jsonc ./
COPY scripts/runtime-lock.ts ./scripts/runtime-lock.ts

RUN deno task build && deno run --allow-read --allow-write --allow-env --allow-run=deno scripts/runtime-lock.ts


FROM denoland/deno:alpine-2.9.7 AS runtime-deps

WORKDIR /app

COPY deno.runtime.jsonc ./deno.jsonc
COPY --from=build /app/deno.runtime.lock ./deno.lock
COPY src ./src

RUN deno install \
    --frozen \
    --prod \
    --skip-types \
    --entrypoint src/main.ts src/commands/admin.ts


FROM denoland/deno:alpine-2.9.7 AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=34567 \
    DATABASE_PATH=/app/data/searcher.sqlite

COPY --from=runtime-deps /deno-dir /deno-dir
COPY --from=runtime-deps /app/deno.jsonc ./deno.jsonc
COPY --from=runtime-deps /app/deno.lock ./deno.lock
COPY src ./src
COPY drizzle ./drizzle
COPY --from=build /app/web/dist ./web/dist

# sharp 的 musl 原生模块需要 libstdc++。
RUN apk add --no-cache libstdc++ && mkdir -p /app/data && chown deno:deno /app/data

USER deno

VOLUME ["/app/data"]
EXPOSE 34567

CMD ["run", "-A", "--cached-only", "src/main.ts"]
