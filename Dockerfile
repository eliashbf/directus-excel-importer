FROM directus/directus:11.5.1
USER root

WORKDIR /directus/extensions/excel-importer-api
COPY ./production-extensions/excel-importer-api/package.json .
RUN npm install --production
RUN mkdir dist
COPY ./production-extensions/excel-importer-api/index.js ./dist/index.js

WORKDIR /directus/extensions/excel-importer-ui
COPY ./production-extensions/excel-importer-ui/package.json .
RUN mkdir dist
COPY ./production-extensions/excel-importer-ui/index.js ./dist/index.js

WORKDIR /directus
RUN chown -R node:node /directus/extensions
USER node