FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.15.0
ARG VITE_USE_PROXY=true
ENV VITE_USE_PROXY=$VITE_USE_PROXY
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
