FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY agent/package.json ./agent/
COPY harness/package.json ./harness/
RUN npm ci
COPY shared ./shared
COPY agent ./agent
COPY harness ./harness
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app/harness
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/agent /app/agent
COPY --from=build /app/harness /app/harness
ENV NODE_ENV=production
CMD ["node", "dist/index.js", "run", "--help"]
