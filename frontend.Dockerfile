# Builds the Frontend of the application inside a node image
# built by ./build-frontend.sh

FROM node:lts-buster

# Install the dependencies
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json /app/
RUN npm install

# Install and build the frontend App
COPY common ../common
COPY frontend/. /app/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN npm run export
