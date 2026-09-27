# sudoku.eipi.dev: one Node process, no dependencies. Profiles are stored as
# JSON files in /data (mount a volume there).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    PUZZLE_DIR=/app/puzzles

COPY package.json ./
COPY server ./server
COPY public ./public
COPY puzzles ./puzzles

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/overview').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/index.js"]
