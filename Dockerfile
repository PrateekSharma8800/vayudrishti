# One small Node process, no dependencies, no build step.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server.js"]
