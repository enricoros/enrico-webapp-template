#!/bin/bash

# update from git
git pull || return

# build container
cp -a backend.Dockerfile.dockerignore .dockerignore
docker build -f backend.Dockerfile -t stardust-api .
rm -f .dockerignore
echo

# remove dangling images (imaged that don't roll up to a tagged image)
#docker rmi $(docker image ls -f dangling=true -q)

# list images
docker image ls -a | head -n 10
echo
