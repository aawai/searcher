FROM denoland/deno:2.9.7 AS build

WORKDIR /app

COPY deno.jsonc deno.lock ./
RUN deno install --frozen

COPY src ./src
COPY web ./web
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

RUN deno task build
RUN deno cache --lock=deno.lock src/main.ts

FROM denoland/deno:2.9.7 AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=34567 \
    DATABASE_PATH=/app/data/searcher.sqlite

COPY --from=build /deno-dir /deno-dir
COPY --from=build /app/deno.jsonc /app/deno.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 34567

CMD ["run", "-A", "--cached-only", "src/main.ts"]
