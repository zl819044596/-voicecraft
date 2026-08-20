FROM nginx:alpine

# Config goes into conf.d/ so it's included inside the stock `http` block,
# allowing `upstream` directives at this level.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/conf.d/security-headers.conf

# Real certs are bind-mounted from ./certs (see docker-compose.yml). The
# directory is created here so the image is self-describing even before the
# mount; scripts/ensure-certs.sh guarantees fullchain.pem + privkey.pem exist
# before `docker compose up` in both dev (self-signed) and prod (Let's Encrypt).
RUN mkdir -p /etc/nginx/certs

EXPOSE 80 443
