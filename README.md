# Project Title

Template for some of my web projects, using a Next/React frontend and Node(TS)/Python services.

#### Description

Search and replace any instance of STARDUST, which is the brand/name placeholder for this
template.

#### Changelog
* Future, ...: ...
* Jun 30, 2021: Created this template for my own use


## Frontend (TS): NextJS + React + Socket.IO + Material UI

See [frontend/](frontend) for the structure

### Develop: run it in IntelliJ
Load this root folder in WebStorm/PHPStorm, configure NPM on the frontend folder, run by executing the
"next dev" npm script.

### Deploy: Static compile as a docker container
See [frontend-build.sh](frontend-build.sh) and see how it creates a docker container, runs it to build
the solution, instantiates it and copies out the files from the build.



## Backend 1 (TS): NodeJS + Express + Socket.IO

This is a Node.JS application written in TypeScript; you can use your favorite IDE to Load and run it, or
run it from the command line.

### Run as a Docker container
See [backend-build.sh](backend-build.sh) and see how it creates a docker container that listens on a given port.

### Run in the IDE
Using IntelliJ, install the TypeScript plugin, right click on the main .ts file and create a debug run configuration.

### Run from the command line
Don't do it! There's no need, it pollutes the folders, etc. However, if you want to do it, here are the steps:
1. Install the required code dependencies (axios, json2csv, redis, yargs) by running:
   ```shell
   cd service-node
   npm install
   ```
1. Set any environment variable - for instance HTTP ports to listen to, or which ML model to use...
   ```shell
   # Note that <VALUE> should be replaced with the value we're talking about
   export SOME_VARIABLE="<VALUE>"
   ```
1. Either: use the downloaded 'ts-node' executable to transpile TS -> JS and Run in node directly:
   ```shell
   ./node_modules/.bin/ts-node src/index.ts
   ```
1. Or: compile TypeScript to JavaScript and run it with ```Node.JS```, for instance:
   ```shell
   npm run tsc
   node src/index.js
   ```

If there's any example usage, show it here.


# Backend 2 (Python): TBA
TBA
