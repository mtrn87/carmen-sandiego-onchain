# -- Build stage --
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build args become VITE_ env vars at build time
ARG VITE_GAME_MASTER_ADDRESS
ARG VITE_CITYNODE_TOKYO_ADDRESS
ARG VITE_CITYNODE_PARIS_ADDRESS
ARG VITE_CITYNODE_LONDON_ADDRESS
ARG VITE_ARBITRUM_SEPOLIA_RPC_URL
ARG VITE_BASE_SEPOLIA_RPC_URL
ARG VITE_XDC_APOTHEM_RPC_URL

RUN npm run build

# -- Serve stage --
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
