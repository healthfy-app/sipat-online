FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY SipatOnline.Web/package.json SipatOnline.Web/
COPY SipatVideoPlayer/package.json SipatVideoPlayer/
RUN npm ci

COPY . .

WORKDIR /app/SipatOnline.Web

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
