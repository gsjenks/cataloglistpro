# Room capture worker (see index.mjs). Built and deployed by Cloud Build:
#   gcloud run deploy room-capture-worker --source worker/room-capture ...
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./

ENV NODE_ENV=production
CMD ["node", "index.mjs"]
