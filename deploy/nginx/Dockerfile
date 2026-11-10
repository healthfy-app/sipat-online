FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY src/SipatOnline.Web/package.json src/SipatOnline.Web/package-lock.json ./
RUN npm ci
COPY src/SipatOnline.Web/ ./
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx/http.conf /etc/nginx/sipat-online-http.conf
COPY deploy/nginx/https.conf /etc/nginx/sipat-online-https.conf
COPY deploy/nginx/entrypoint.sh /usr/local/bin/sipat-online-entrypoint
COPY --from=frontend-build /app/dist/ /usr/share/nginx/html/
RUN chmod 0755 /usr/local/bin/sipat-online-entrypoint \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/sipat-online-entrypoint"]
