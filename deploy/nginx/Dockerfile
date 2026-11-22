# the static build runs on the machine that builds (no emulation); only the nginx stage is per platform
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend-build
WORKDIR /app
COPY src/Web/package.json src/Web/package-lock.json ./
COPY src/Web/SipatOnline.Web/package.json SipatOnline.Web/
COPY src/Web/SipatVideoPlayer/package.json SipatVideoPlayer/
RUN npm ci
COPY src/Web/SipatOnline.Web/ SipatOnline.Web/
COPY src/Web/SipatVideoPlayer/ SipatVideoPlayer/
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx/http.conf /etc/nginx/sipat-online-http.conf
COPY deploy/nginx/https.conf /etc/nginx/sipat-online-https.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/sipat-online-security-headers.conf
COPY deploy/nginx/entrypoint.sh /usr/local/bin/sipat-online-entrypoint
COPY --from=frontend-build /app/SipatOnline.Web/dist/ /usr/share/nginx/html/
RUN chmod 0755 /usr/local/bin/sipat-online-entrypoint \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/sipat-online-entrypoint"]
