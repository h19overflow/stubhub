FROM node:24-alpine AS manifests
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY --chown=1000:1000 client/package.json ./client/package.json
COPY --chown=1000:1000 auth/package.json ./auth/package.json
COPY --chown=1000:1000 common/package.json ./common/package.json
COPY --chown=1000:1000 tickets/package.json ./tickets/package.json
COPY --chown=1000:1000 orders/package.json ./orders/package.json
COPY --chown=1000:1000 moderation/package.json ./moderation/package.json

FROM manifests AS workspace-deps
RUN npm ci

FROM workspace-deps AS common-build
COPY --chown=node:node common ./common
USER 1000:1000
RUN npm run build --workspace @stubhub/common
USER 0:0

FROM workspace-deps AS client-dev
COPY --chown=node:node client ./client
USER 1000:1000
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@stubhub/client"]

FROM common-build AS identity-dev
COPY --chown=node:node auth ./auth
USER 1000:1000
EXPOSE 3001
CMD ["npm", "run", "dev", "--workspace", "@stubhub/identity"]

FROM common-build AS tickets-dev
COPY --chown=node:node tickets ./tickets
USER 1000:1000
EXPOSE 3002
CMD ["npm", "run", "dev", "--workspace", "@stubhub/tickets"]

FROM common-build AS orders-dev
COPY --chown=node:node orders ./orders
USER 1000:1000
EXPOSE 3003
CMD ["npm", "run", "dev", "--workspace", "@stubhub/orders"]

FROM common-build AS moderation-dev
COPY --chown=node:node moderation ./moderation
USER 1000:1000
EXPOSE 3004
CMD ["npm", "run", "dev", "--workspace", "@stubhub/moderation"]

FROM workspace-deps AS client-build
ARG IDENTITY_SERVICE_URL=http://identity:3001
ARG TICKETS_SERVICE_URL=http://tickets:3002
ARG ORDERS_SERVICE_URL=http://orders:3003
ARG MODERATION_SERVICE_URL=http://moderation:3004
ENV IDENTITY_SERVICE_URL=$IDENTITY_SERVICE_URL
ENV TICKETS_SERVICE_URL=$TICKETS_SERVICE_URL
ENV ORDERS_SERVICE_URL=$ORDERS_SERVICE_URL
ENV MODERATION_SERVICE_URL=$MODERATION_SERVICE_URL
COPY client ./client
RUN npm run build --workspace @stubhub/client

FROM common-build AS identity-build
COPY auth ./auth
RUN npm run build --workspace @stubhub/identity

FROM common-build AS tickets-build
COPY tickets ./tickets
RUN npm run build --workspace @stubhub/tickets

FROM common-build AS orders-build
COPY orders ./orders
RUN npm run build --workspace @stubhub/orders

FROM common-build AS moderation-build
COPY moderation ./moderation
RUN npm run build --workspace @stubhub/moderation

FROM manifests AS client-prod-deps
RUN npm ci --omit=dev --workspace @stubhub/client

FROM common-build AS identity-prod-deps
RUN npm ci --omit=dev --workspace @stubhub/identity

FROM common-build AS tickets-prod-deps
RUN npm ci --omit=dev --workspace @stubhub/tickets

FROM manifests AS orders-prod-deps
RUN npm ci --omit=dev --workspace @stubhub/orders

FROM manifests AS moderation-prod-deps
RUN npm ci --omit=dev --workspace @stubhub/moderation

FROM node:24-alpine AS client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=client-prod-deps /app/node_modules ./node_modules
COPY --from=client-build /app/client/package.json ./client/package.json
COPY --from=client-build --chown=node:node /app/client/.next ./client/.next
WORKDIR /app/client
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "../node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM node:24-alpine AS identity
ENV NODE_ENV=production
WORKDIR /app
COPY --from=identity-prod-deps /app/node_modules ./node_modules
COPY --from=identity-build /app/auth/package.json ./auth/package.json
COPY --from=identity-build /app/auth/migrations ./auth/migrations
COPY --from=identity-build /app/auth/dist ./auth/dist
COPY --from=common-build /app/common/package.json ./common/package.json
COPY --from=common-build /app/common/dist ./common/dist
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "auth/dist/index.js"]

FROM node:24-alpine AS tickets
ENV NODE_ENV=production
WORKDIR /app
COPY --from=tickets-prod-deps /app/node_modules ./node_modules
COPY --from=tickets-build /app/tickets/package.json ./tickets/package.json
COPY --from=tickets-build /app/tickets/dist ./tickets/dist
COPY --from=tickets-build /app/tickets/migrations ./tickets/migrations
COPY --from=common-build /app/common/package.json ./common/package.json
COPY --from=common-build /app/common/dist ./common/dist
USER 1000:1000
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "tickets/dist/index.js"]

FROM node:24-alpine AS orders
ENV NODE_ENV=production
WORKDIR /app
COPY --from=orders-prod-deps /app/node_modules ./node_modules
COPY --from=orders-build /app/orders/package.json ./orders/package.json
COPY --from=orders-build /app/orders/dist ./orders/dist
COPY --from=orders-build /app/orders/migrations ./orders/migrations
COPY --from=common-build /app/common/package.json ./common/package.json
COPY --from=common-build /app/common/dist ./common/dist
USER 1000:1000
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3003/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "orders/dist/index.js"]

FROM node:24-alpine AS moderation
ENV NODE_ENV=production
WORKDIR /app
COPY --from=moderation-prod-deps /app/node_modules ./node_modules
COPY --from=moderation-build /app/moderation/package.json ./moderation/package.json
COPY --from=moderation-build /app/moderation/dist ./moderation/dist
COPY --from=moderation-build /app/moderation/migrations ./moderation/migrations
COPY --from=common-build /app/common/package.json ./common/package.json
COPY --from=common-build /app/common/dist ./common/dist
USER 1000:1000
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3004/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "moderation/dist/index.js"]
