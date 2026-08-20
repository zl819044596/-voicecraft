# Render worker image — ffmpeg + libass + node.
#
# linuxserver/ffmpeg ships ffmpeg/ffprobe compiled with libass (subtitles burn)
# and the standard encoder set. We layer Node 22 LTS on top to run the worker
# that consumes avs:render jobs (srt / compose / compose-i2v) — see worker/index.js.

FROM linuxserver/ffmpeg:latest

ENV FFMPEG_BINARY=/usr/local/bin/ffmpeg
ENV FFPROBE_BINARY=/usr/local/bin/ffprobe
ENV NODE_MAJOR=22

# Node.js 22 LTS (NodeSource) on the Ubuntu base + curl for the healthcheck.
# fonts-noto-cjk: Chinese subtitles rendered as boxes (□) without a CJK font —
# libass falls back to DejaVu (no CJK glyphs) when no Chinese font is installed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates gnupg fonts-noto-cjk \
  && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node --version && npm --version && curl --version | head -1

WORKDIR /srv/render

COPY worker/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY worker ./worker

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:4001/health >/dev/null || exit 1

# Override linuxserver/ffmpeg's default ffmpeg-wrapper entrypoint so our
# worker process (node) is container PID 1, not ffmpeg.
ENTRYPOINT []

CMD ["node", "worker/index.js"]
