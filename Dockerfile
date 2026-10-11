FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY *.mjs ./
COPY data ./data
ENV PORT=8787
EXPOSE 8787
CMD ["node", "index.mjs"]
