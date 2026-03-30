FROM node:20-bookworm-slim

WORKDIR /app

# System deps:
# - chromium + fonts/libs for Puppeteer scrapers
# - curl/ca-certificates for fetching supercronic
# - util-linux for flock
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dumb-init \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    util-linux \
  && rm -rf /var/lib/apt/lists/*

# Puppeteer: point to system chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Enable pnpm via Corepack
RUN corepack enable

# Install deps first (better layer cache)
# package.json references patchedDependencies (pnpm patches/*.patch) — must exist before install
COPY pnpm-lock.yaml package.json ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Copy app sources
COPY . .

# supercronic (small cron runner)
RUN curl -fsSL -o /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64" \
  && chmod +x /usr/local/bin/supercronic

COPY docker/cronfile /etc/cronfile
COPY docker/jobs/ /app/docker/jobs/

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/supercronic", "/etc/cronfile"]

