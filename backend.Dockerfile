# Backend API, serving the websocket messages
#
#  Build:       docker build -f backend.Dockerfile -t api .
#  Run Redis:   docker run --rm -d  --name redis -v redis-data:/data  redis:buster
#  Run:         docker run --rm -it --name api --link redis -p 127.0.0.1:13370:1996 --env-file=backend.env  api
#
#  note: customize microservice providers addresses in the environment file (if it
#        doesn't exist, copy from the template). If services are in local docker
#        containers, use the '--link container_name' run option.
#

## [Base]
FROM node:lts-buster

# set the timezone where this is run
RUN ln -nsf /usr/share/zoneinfo/America/Los_Angeles /etc/localtime

# install the dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/tsconfig.json /app/
RUN npm install

# copy the source, and transpile typescript
COPY common ../common
COPY service-node/. /app/

# build
RUN npm run tsc

# do not set any standard env here, pass an env file when instantiating the container

# specify run command executable
CMD node src/index.js
