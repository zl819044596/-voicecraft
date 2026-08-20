FROM linuxserver/ffmpeg:latest

ENV FFMPEG_BINARY=/usr/local/bin/ffmpeg
ENV FFPROBE_BINARY=/usr/local/bin/ffprobe
ENV PORT=4002

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl fonts-noto-cjk nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/compose
COPY server.js ./

EXPOSE 4002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:4002/health >/dev/null || exit 1

ENTRYPOINT []
CMD ["node", "server.js"]
