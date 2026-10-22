# syntax=docker/dockerfile:1-labs
# ---------------------------------------------
# Overleaf Community Edition (overleaf/overleaf)
# ---------------------------------------------

ARG OVERLEAF_BASE_TAG=sharelatex/sharelatex-base:latest
FROM $OVERLEAF_BASE_TAG

ENV PATH="/usr/local/texlive/2023/bin/x86_64-linux:${PATH}"

# Remove legacy ShareLaTeX branded paths that the v5 startup check rejects
RUN rm -rf /var/lib/sharelatex /var/log/sharelatex /etc/sharelatex

# A imagem base usa Node.js 16; Yarn 4.x exige >= 18.12.0.
# Instala Node.js 20 LTS via nodesource antes de qualquer coisa.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && \
    npm install -g tsx

WORKDIR /overleaf

# Add required source files for yarn install
# -------------------------------------------
COPY --parents libraries/*/package.json .yarn/patches/ .yarn/releases/ services/*/package.json tools/migrations/ package.json yarn.lock .yarnrc.yml /overleaf/
COPY server-ce/genScript.js server-ce/services.js /overleaf/

# Cria wrapper direto para yarn usando o binário empacotado — sem corepack, sem rede
RUN printf '#!/bin/sh\nexec node /overleaf/.yarn/releases/yarn-4.14.1.cjs "$@"\n' \
    > /usr/local/bin/yarn && chmod +x /usr/local/bin/yarn

# Cria package.json stubs para workspaces listados no package.json raiz que não existem
# no repositório CE (serviços exclusivos do SaaS) ou que não foram copiados para esta
# camada do build. Yarn 4.x exige que todo diretório de workspace tenha um package.json.
RUN node - <<'EOF'
const fs   = require('fs')
const path = require('path')
const pkg  = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const ws of pkg.workspaces) {
  if (ws.includes('*')) continue          // globs são resolvidos pelo yarn
  const pkgFile = path.join(ws, 'package.json')
  if (!fs.existsSync(pkgFile)) {
    fs.mkdirSync(ws, { recursive: true })
    fs.writeFileSync(pkgFile, JSON.stringify({
      name: path.basename(ws), version: '0.0.0', private: true
    }) + '\n')
    console.log('stub criado:', pkgFile)
  }
}
EOF

# Install yarn dependencies
# -------------------------
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/root/.yarn/berry/cache,id=server-ce-yarn-cache \
    --mount=type=tmpfs,target=/tmp \
    sh -c 'set -e; \
      echo "=== yarn binary: $(which yarn)"; \
      echo "=== node version: $(node --version)"; \
      yarn --version; \
      node genScript install | bash'

# Add the actual source files
# ---------------------------
COPY --parents libraries/ services/ tools/migrations/ /overleaf/
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/root/.yarn/berry/cache,id=server-ce-yarn-cache \
    --mount=type=cache,target=/overleaf/services/web/node_modules/.cache,id=server-ce-webpack-cache \
    --mount=type=tmpfs,target=/tmp \
    YARN_CACHE_FOLDER=/tmp/.yarn-cache node genScript compile | bash

# Copy runit service startup scripts to its location
# --------------------------------------------------
ADD server-ce/runit /etc/service
RUN chmod -R a+x /etc/service/ && mkdir -p /var/log/overleaf

# Copy runit global settings to its location
# ------------------------------------------
ADD server-ce/config/env.sh /etc/overleaf/env.sh

# Configure nginx
# ---------------
ADD server-ce/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
ADD server-ce/nginx/overleaf.conf /etc/nginx/sites-enabled/overleaf.conf
ADD server-ce/nginx/clsi-nginx.conf /etc/nginx/sites-enabled/clsi-nginx.conf


# Configure log rotation
# ----------------------
ADD server-ce/logrotate/overleaf /etc/logrotate.d/overleaf
RUN chmod 644 /etc/logrotate.d/overleaf

# Configure cron tasks
# ----------------------
ADD server-ce/cron /overleaf/cron
ADD server-ce/config/crontab-history /etc/cron.d/crontab-history
RUN chmod 600 /etc/cron.d/crontab-history
ADD server-ce/config/crontab-deletion /etc/cron.d/crontab-deletion
RUN chmod 600 /etc/cron.d/crontab-deletion

# Copy Phusion Image startup and shutdown scripts to their locations
# ------------------------------------------------------------------
COPY server-ce/init_scripts/ /etc/my_init.d/
COPY server-ce/init_preshutdown_scripts/ /etc/my_init.pre_shutdown.d/
RUN chmod -R a+x /etc/my_init.d/ /etc/my_init.pre_shutdown.d/

# Copy app settings files
# -----------------------
COPY server-ce/config/settings.js /etc/overleaf/settings.js

# Copy history-v1 files
# -----------------------
COPY server-ce/config/production.json /overleaf/services/history-v1/config/production.json
COPY server-ce/config/custom-environment-variables.json /overleaf/services/history-v1/config/custom-environment-variables.json

# Copy grunt thin wrapper
# -----------------------
ADD server-ce/bin/grunt /usr/local/bin/grunt
RUN chmod +x /usr/local/bin/grunt

# Copy history helper scripts
# ---------------------------
ADD server-ce/bin/flush-history-queues /overleaf/bin/flush-history-queues
RUN chmod +x /overleaf/bin/flush-history-queues
ADD server-ce/bin/force-history-resyncs /overleaf/bin/force-history-resyncs
RUN chmod +x /overleaf/bin/force-history-resyncs

# Copy Latexmkrc
# -----------------------
COPY server-ce/config/latexmkrc /usr/local/share/latexmk/LatexMk

# File that controls open|closed status of the site
# -------------------------------------------------
ENV SITE_MAINTENANCE_FILE="/etc/overleaf/site_status"
RUN touch $SITE_MAINTENANCE_FILE

# Set Environment Variables
# --------------------------------
ENV OVERLEAF_CONFIG=/etc/overleaf/settings.js

ENV WEB_API_USER="overleaf"
ENV ADMIN_PRIVILEGE_AVAILABLE="true"

ENV OVERLEAF_APP_NAME="Overleaf Community Edition"

ENV OPTIMISE_PDF="true"

# Phusion Image timeouts before sending SIGKILL to processes
# ----------------------------------------------------------
ENV KILL_PROCESS_TIMEOUT=55
ENV KILL_ALL_PROCESSES_TIMEOUT=55
ENV GRACEFUL_SHUTDOWN_DELAY_SECONDS=1

ENV NODE_ENV="production"
ENV LOG_LEVEL="info"


EXPOSE 80

ENTRYPOINT ["/sbin/my_init"]
