#!/bin/bash

# change this to specify where this application will be served from
# it not in a parameter yet for risk management
INSTALL_DIR="/srv/fyi.stardust/static/"

echo "Building the Frontend with a clean docker create-react-app build,"
echo " and installing on $INSTALL_DIR. Edit this script to change."

# Uncomment to refresh
git pull || return

# Build
cp -a frontend.Dockerfile.dockerignore .dockerignore
docker build -f frontend.Dockerfile -t stardust-frontend .
rm -f .dockerignore

# remove dangling images (imaged that don't roll up to a tagged image)
docker rmi $(docker image ls -f dangling=true -q) 2> /dev/null
echo

# Install
mkdir -p "$INSTALL_DIR"
rm -fr "$INSTALL_DIR/_next"
# instantiate a container and extract the files into the installation directory
docker create -ti --name stardust-frontend-dummy stardust-frontend:latest bash
docker cp stardust-frontend-dummy:/app/out/. "$INSTALL_DIR"
docker rm -f stardust-frontend-dummy
echo

# verify the files to be present
echo -n "Contents of: "
ls -d --color=yes "$INSTALL_DIR"
ls -l --color=yes "$INSTALL_DIR"
echo
