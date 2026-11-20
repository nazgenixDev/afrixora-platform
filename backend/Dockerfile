# Construction de l’API et des outils Prisma
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/

RUN npm run build \
    && ./node_modules/.bin/tsc --target ES2020 --module commonjs --esModuleInterop \
       --skipLibCheck --outDir /app/seed prisma/seed.ts

# Stage 2: Runner
FROM node:22-alpine

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# OpenSSL est également requis par les moteurs Prisma dans le conteneur final.
RUN apk add --no-cache tzdata openssl

# Set timezone
ENV TZ=Africa/Kinshasa

COPY package*.json ./
RUN npm ci --omit=dev

# Copie du CLI et des moteurs à la version verrouillée par npm ci.
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma/
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/
COPY --from=builder /app/seed/seed.js ./prisma/seed.js
RUN ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
    && npm pkg set 'prisma.seed=node prisma/seed.js'

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

RUN addgroup -S afrixora && adduser -S afrixora -G afrixora \
    && mkdir /app/logs && chown afrixora:afrixora /app/logs
USER afrixora

# Expose the port the app runs on
EXPOSE 4000

# Disponibilité de l’API et de ses dépendances
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/ready || exit 1

# Start the application
CMD ["node", "dist/server.js"]
