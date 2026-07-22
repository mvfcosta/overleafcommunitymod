---
name: Overleaf CE — Roteiro de Modificações
description: Arquivo de instruções para Claude aplicar todas as modificações customizadas no Overleaf Community Edition ao atualizar para nova versão. Cobre LDAP, track changes, comentários, colaboradores (limite 10), Node 20, tsx, e-mail SMTP, login customizado (logo UNESP + card + navbar #1F3765), navbar interna (SA01.gif), template local (zip), galeria em nova aba, rotas de threads/ranges ausentes no CE.
type: project
originSessionId: bc63ce6c-b03e-40a4-93d3-1011b7b29a7b
---
<!--
  ╔══════════════════════════════════════════════════════════════════════╗
  ║  COMO USAR ESTE ARQUIVO — ATUALIZAÇÃO DE VERSÃO DO OVERLEAF CE       ║
  ║                                                                      ║
  ║  Quando sair uma nova versão do Overleaf CE, diga para o Claude:     ║
  ║                                                                      ║
  ║    "Saiu uma nova versão do Overleaf CE. O código novo está em       ║
  ║     F:\overleaf-main\overleaf-main — aplique todas as               ║
  ║     modificações do roteiro salvo na memória."                       ║
  ║                                                                      ║
  ║  O Claude irá:                                                       ║
  ║    1. Ler este arquivo                                               ║
  ║    2. Ler cada arquivo-alvo na nova versão                           ║
  ║    3. Aplicar cada modificação com Edit/Write                        ║
  ║    4. Informar conflitos que precisem de ajuste manual               ║
  ║                                                                      ║
  ║  ESTRATÉGIAS DE DEPLOY (importante para saber o que rebuildar):      ║
  ║                                                                      ║
  ║  A) REBUILD COMPLETO DA IMAGEM DOCKER                                ║
  ║     Necessário quando mudam arquivos .tsx/.ts (frontend webpack),    ║
  ║     Dockerfile, runit scripts ou settings.js.                        ║
  ║     Comando: docker compose build && docker compose up -d            ║
  ║                                                                      ║
  ║  B) DOCKER CP + RESTART DO SERVIÇO WEB (sem rebuild)                 ║
  ║     Suficiente para arquivos .mjs do backend e .pug do servidor.     ║
  ║     Comando (para cada arquivo modificado):                          ║
  ║       docker cp <arquivo-local> sharelatex:<caminho-no-container>    ║
  ║     Depois: docker exec sharelatex sv restart web                    ║
  ║     (ou: docker restart sharelatex  — se sv restart não funcionar)   ║
  ║                                                                      ║
  ║  C) SEM AÇÃO — arquivos montados via volume Docker                   ║
  ║     Editar o arquivo no servidor (/srv/overleaf-dados/...) e         ║
  ║     reiniciar o container. Não exige rebuild nem cp.                 ║
  ║                                                                      ║
  ╚══════════════════════════════════════════════════════════════════════╝
-->

# INSTRUÇÕES PARA CLAUDE

Ao receber o prompt do usuário, leia este arquivo, depois:
1. Para cada item do CHECKLIST, leia o arquivo-alvo na nova versão.
2. Aplique a modificação descrita com Edit ou Write.
3. Marque cada item ao concluir.
4. Ao final, informe: arquivos alterados, estratégia de deploy necessária (A/B/C) e se houve conflito.

BASE_DIR = F:/overleaf-main/overleaf-main

---

## CHECKLIST DE APLICAÇÃO

### Grupo A — Exigem rebuild da imagem Docker
- [ ] 1.  Dockerfile — Node 20 + tsx + yarn wrapper + stubs
- [ ] 2.  .yarnrc.yml — nodeLinker e arquiteturas
- [ ] 3.  server-ce/config/settings.js — defaultFeatures + colaboradores + LDAP + OVERLEAF_TEMPLATE_LINKS
- [ ] 4.  services/web/config/settings.defaults.js — trackChanges, featuresEpoch, moduleImportSequence
- [ ] 5.  AuthenticationController.mjs — seleção dinâmica de estratégia (local vs ldapauth)
- [ ] 6.  AuthenticationErrors.mjs — LdapAuthenticationError
- [ ] 7.  ProjectEditorHandler.mjs — trackChangesAvailable: true
- [ ] 8.  LimitationsManager.mjs — checagem != null nos colaboradores
- [ ] 9.  ldap-authentication/index.mjs — hook passportSetup
- [ ] 10. ldap-authentication/LdapAuthManager.mjs — provisioning de usuário
- [ ] 11. header-logo-or-title.tsx — SA01.gif na navbar interna
- [ ] 12. new-project-button.tsx — seção "Templates UNESP" + Galeria em nova aba
- [ ] 13. utils/meta.ts — type definition ol-localTemplates
- [ ] 14. runit/notifications — tsx + LISTEN_ADDRESS
- [ ] 15. runit/docstore — LISTEN_ADDRESS
- [ ] 16. runit/filestore — LISTEN_ADDRESS
- [ ] 17. runit/clsi — LISTEN_ADDRESS

### Grupo B — Docker cp + sv restart web (sem rebuild)
- [ ] 18. router.mjs — rotas de threads, ranges e local-templates
- [ ] 19. Features/Chat/ThreadsController.mjs — NOVO: comentários do review panel
- [ ] 20. Features/Ranges/RangesController.mjs — NOVO: aba Overview do review panel
- [ ] 21. Features/Templates/LocalTemplatesController.mjs — NOVO: criar projeto de template local
- [ ] 22. Features/Templates/LocalTemplatesRouter.mjs — NOVO: roteador de templates locais
- [ ] 23. Features/Project/ProjectListController.mjs — carrega localTemplates para a UI
- [ ] 24. app/views/project/list-react.pug — meta tag ol-localTemplates

### Grupo C — Volume Docker (editar no servidor, sem rebuild)
- [ ] 25. docker-compose.yml — environment + volumes
- [ ] 26. /srv/overleaf-dados/login.pug — página de login UNESP customizada
- [ ] 27. /srv/overleaf-dados/SA01.gif — logo animado (arquivo físico)
- [ ] 28. /srv/overleaf-dados/logo_Unesp.png — logo estático (arquivo físico)

---

## MODIFICAÇÕES DETALHADAS

---

### 1. `server-ce/Dockerfile`

**Problema resolvido:** imagem base usa Node 16; Yarn 4.x exige >= 18.12.0; workspaces exclusivos do SaaS quebram o `yarn install`; caminhos legados `/var/lib/sharelatex` rejeitados pelo startup v5.

Logo após a linha `FROM $OVERLEAF_BASE_TAG`, adicionar:

```dockerfile
# Remove legacy ShareLaTeX branded paths que o v5 startup check rejeita
RUN rm -rf /var/lib/sharelatex /var/log/sharelatex /etc/sharelatex

# Instala Node.js 20 LTS (imagem base usa Node 16; Yarn 4.x exige >= 18.12.0)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && \
    npm install -g tsx
```

Substituir qualquer linha que crie o wrapper do yarn por:

```dockerfile
# Wrapper direto para yarn usando o binário empacotado — sem corepack, sem rede
RUN printf '#!/bin/sh\nexec node /overleaf/.yarn/releases/yarn-4.14.1.cjs "$@"\n' \
    > /usr/local/bin/yarn && chmod +x /usr/local/bin/yarn
```

> ATENÇÃO: verificar o nome real do arquivo `.cjs` dentro de `.yarn/releases/` após COPY — ele muda a cada versão do Yarn. Atualizar o nome no comando acima se necessário.

Adicionar antes do primeiro `RUN node genScript install | bash`:

```dockerfile
# Cria package.json stubs para workspaces SaaS ausentes no CE
RUN node - <<'EOF'
const fs   = require('fs')
const path = require('path')
const pkg  = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const ws of pkg.workspaces) {
  if (ws.includes('*')) continue
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
```

---

### 2. `.yarnrc.yml`

**Problema resolvido:** Yarn 4 por padrão usa PnP, incompatível com o build do Overleaf.

O arquivo deve conter exatamente:

```yaml
approvedGitRepositories:
  - "**"

enableGlobalCache: false

enableScripts: true

nodeLinker: node-modules

supportedArchitectures:
  cpu:
    - current
    - arm64
    - x64
  libc:
    - current
    - glibc
  os:
    - current
    - darwin
    - linux
```

---

### 3. `server-ce/config/settings.js`

**Problema resolvido:** CE padrão não tem LDAP, limita colaboradores a 1, não habilita track changes, não suporta OVERLEAF_TEMPLATE_LINKS.

#### 3a. `defaultFeatures` com colaboradores limitados a 10

Localizar o bloco `history:` e adicionar logo após seu fechamento `}`:

```js
  notifications: undefined,

  defaultFeatures: {
    collaborators: 10,
    dropbox: true,
    versioning: true,
    compileTimeout: parseIntOrFail(process.env.COMPILE_TIMEOUT || 180),
    compileGroup: 'standard',
    trackChanges: true,
    references: true,
  },
```

> Nota: `collaborators: 10` limita a 10 editores por projeto. Use `-1` para ilimitado.

#### 3b. Suporte a OVERLEAF_TEMPLATE_LINKS

Adicionar após o bloco `OVERLEAF_LOGIN_SUPPORT_TITLE`:

```js
if (process.env.OVERLEAF_TEMPLATE_LINKS != null) {
  try {
    settings.templateLinks = JSON.parse(process.env.OVERLEAF_TEMPLATE_LINKS)
  } catch (error3) {
    console.error('could not parse OVERLEAF_TEMPLATE_LINKS, not valid JSON')
  }
}
```

#### 3c. Bloco LDAP

Adicionar no final do arquivo, antes de `module.exports = settings`:

```js
// ─── Autenticação LDAP / Active Directory ────────────────────────────────────
if (process.env.OVERLEAF_LDAP_HOST) {
  const ldapTlsOptions =
    process.env.OVERLEAF_LDAP_TLS_REJECT_UNAUTH === 'false'
      ? { rejectUnauthorized: false }
      : {}

  settings.ldap = {
    enable: true,
    host: process.env.OVERLEAF_LDAP_HOST,
    port: parseInt(process.env.OVERLEAF_LDAP_PORT || '389', 10),
    secure: process.env.OVERLEAF_LDAP_SECURE === 'true',
    tlsOptions: ldapTlsOptions,
    bindDN: process.env.OVERLEAF_LDAP_BIND_DN,
    bindCredentials: process.env.OVERLEAF_LDAP_BIND_CREDENTIALS,
    searchBase: process.env.OVERLEAF_LDAP_SEARCH_BASE,
    searchFilter: process.env.OVERLEAF_LDAP_SEARCH_FILTER || '(mail={{username}})',
    emailAtt: process.env.OVERLEAF_LDAP_EMAIL_ATT || 'mail',
    firstNameAtt: process.env.OVERLEAF_LDAP_FIRST_NAME_ATT || 'givenName',
    lastNameAtt: process.env.OVERLEAF_LDAP_LAST_NAME_ATT || 'sn',
    updateUserDetailsOnLogin:
      process.env.OVERLEAF_LDAP_UPDATE_USER_DETAILS_ON_LOGIN === 'true',
  }
}
```

---

### 4. `services/web/config/settings.defaults.js`

#### 4a. `trackChanges: true` em `defaultFeatures`

Localizar o bloco `defaultFeatures = {` e garantir que contenha `trackChanges: true`.

#### 4b. `featuresEpoch`

Logo após o fechamento do bloco `defaultFeatures`, adicionar se não existir:

```js
featuresEpoch: '2024-01-01',
```

#### 4c. `moduleImportSequence`

Garantir que `'ldap-authentication'` está presente:

```js
moduleImportSequence: [
  'history-v1',
  'launchpad',
  'ldap-authentication',
  'server-ce-scripts',
  'user-activate',
],
```

---

### 5. `services/web/app/src/Features/Authentication/AuthenticationController.mjs`

**Problema resolvido:** `passportLogin` sempre usava estratégia `'local'`; com LDAP ativo deve usar `'ldapauth'`.

Dentro do método `passportLogin`, substituir:

```js
// ANTES:
passport.authenticate('local', { keepSessionInfo: true }, async function (err, user, info) {

// DEPOIS:
const strategy = Settings.ldap?.enable ? 'ldapauth' : 'local'
passport.authenticate(strategy, { keepSessionInfo: true }, async function (err, user, info) {
```

No bloco de falha (quando `user` é falso), normalizar o `info`:

```js
const normalizedInfo =
  info?.type != null
    ? info
    : {
        type: 'error',
        key: 'invalid-password-retry-or-reset',
        status: 401,
      }
// Usar normalizedInfo no lugar de info nas linhas seguintes
```

---

### 6. `services/web/app/src/Features/Authentication/AuthenticationErrors.mjs`

Adicionar após as classes de erro existentes:

```js
export class LdapAuthenticationError extends Errors.BackwardCompatibleError {}
```

Adicionar ao objeto `export default`:

```js
LdapAuthenticationError,
```

---

### 7. `services/web/app/src/Features/Project/ProjectEditorHandler.mjs`

**Problema resolvido:** painel "Review" nunca aparecia no CE.

Garantir que a primeira propriedade do objeto seja:

```js
export default ProjectEditorHandler = {
  trackChangesAvailable: true,
  // ... resto do objeto
```

---

### 8. `services/web/app/src/Features/Subscription/LimitationsManager.mjs`

**Problema resolvido:** checagem `if (user?.features?.collaborators)` trata `null` erroneamente.

Localizar a função `allowedNumberOfCollaboratorsForUser` e corrigir:

```js
// ANTES:
if (user?.features?.collaborators) {

// DEPOIS:
if (user?.features?.collaborators != null) {
```

---

### 9. `services/web/modules/ldap-authentication/index.mjs`

Se o arquivo não existir ou tiver conteúdo diferente, substituir pelo conteúdo completo:

```js
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import { Strategy as LdapStrategy } from 'passport-ldapauth'
import LdapAuthManager from './app/src/LdapAuthManager.mjs'

async function passportSetup(passport) {
  if (!Settings.ldap?.enable) return

  const protocol = Settings.ldap.secure ? 'ldaps' : 'ldap'
  const port = Settings.ldap.port || (Settings.ldap.secure ? 636 : 389)
  const serverUrl = `${protocol}://${Settings.ldap.host}:${port}`

  passport.use(
    'ldapauth',
    new LdapStrategy(
      {
        server: {
          url: serverUrl,
          bindDN: Settings.ldap.bindDN,
          bindCredentials: Settings.ldap.bindCredentials,
          searchBase: Settings.ldap.searchBase,
          searchFilter: Settings.ldap.searchFilter || '(mail={{username}})',
          tlsOptions: Settings.ldap.tlsOptions || {},
        },
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true,
      },
      async (req, ldapUser, done) => {
        try {
          const user = await LdapAuthManager.findOrCreateUser(ldapUser)
          done(null, user)
        } catch (err) {
          logger.err({ err, ldapUser: { dn: ldapUser.dn } }, 'LDAP: error provisioning user')
          done(err)
        }
      }
    )
  )

  logger.debug({ url: serverUrl, searchBase: Settings.ldap.searchBase }, 'LDAP: passport strategy registered')
}

const LdapAuthenticationModule = {
  hooks: { promises: { passportSetup } },
}
export default LdapAuthenticationModule
```

---

### 10. `services/web/modules/ldap-authentication/app/src/LdapAuthManager.mjs`

Se o arquivo não existir ou tiver conteúdo diferente, substituir pelo conteúdo completo:

```js
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import UserCreator from '../../../../app/src/Features/User/UserCreator.mjs'
import UserUpdater from '../../../../app/src/Features/User/UserUpdater.mjs'
import EmailHelper from '../../../../app/src/Features/Helpers/EmailHelper.mjs'

function _extractEmail(ldapUser) {
  const emailAtt = Settings.ldap?.emailAtt || 'mail'
  const rawEmail = ldapUser[emailAtt] || ldapUser.mail || ldapUser.email || ldapUser.userPrincipalName
  return EmailHelper.parseEmail(rawEmail)
}

function _extractFirstName(ldapUser) {
  const att = Settings.ldap?.firstNameAtt || 'givenName'
  return (ldapUser[att] || ldapUser.givenName || '').trim()
}

function _extractLastName(ldapUser) {
  const att = Settings.ldap?.lastNameAtt || 'sn'
  return (ldapUser[att] || ldapUser.sn || '').trim()
}

async function findOrCreateUser(ldapUser) {
  const email = _extractEmail(ldapUser)
  if (!email) {
    throw new OError('LDAP user has no valid email address', {
      ldapAttUsed: Settings.ldap?.emailAtt || 'mail',
      ldapUserKeys: Object.keys(ldapUser),
    })
  }

  const firstName = _extractFirstName(ldapUser)
  const lastName  = _extractLastName(ldapUser)

  let user = await UserGetter.promises.getUserByAnyEmail(email)

  if (!user) {
    logger.debug({ email }, 'LDAP: provisioning new local account')
    user = await UserCreator.promises.createNewUser({
      email,
      first_name: firstName,
      last_name: lastName,
      holdingAccount: false,
    })
    logger.debug({ email, userId: user._id }, 'LDAP: new account provisioned')
  } else if (Settings.ldap?.updateUserDetailsOnLogin) {
    logger.debug({ email, userId: user._id }, 'LDAP: updating user details from directory')
    await UserUpdater.promises.updateUser(user._id, {
      $set: { first_name: firstName, last_name: lastName },
    })
    user.first_name = firstName
    user.last_name  = lastName
  }

  return user
}

export default { findOrCreateUser, _extractEmail, _extractFirstName, _extractLastName }
```

---

### 11. `services/web/frontend/js/shared/components/navbar/header-logo-or-title.tsx`

**Problema resolvido:** navbar das páginas internas mostrava só texto; queremos SA01.gif à esquerda do título.

A função deve retornar:

```tsx
return (
  <a href="/" aria-label={appName} className="navbar-brand" style={{ display: 'flex', alignItems: 'center' }}>
    {(customLogo || !title) && (
      <div
        className="navbar-logo"
        style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : {}}
      />
    )}
    <img
      src="/img/SA01.gif"
      alt="UNESP"
      style={{ height: '24px', marginRight: '6px', flexShrink: 0 }}
    />
    {title && (
      <div className="navbar-title">
        <span>{title}</span>
      </div>
    )}
  </a>
)
```

> `display: flex; alignItems: center` no `<a>` é essencial — `verticalAlign: middle` não funciona em elementos flex.

---

### 12. `services/web/frontend/js/features/project-list/components/new-project-button.tsx`

**Duas modificações neste arquivo.**

#### 12a. Galeria Overleaf abre em nova aba

Localizar o `<DropdownItem>` que renderiza links de templateLinks e garantir que tenha:

```tsx
<DropdownItem
  href={templateLink.url}
  target="_blank"
  rel="noopener noreferrer"
  onClick={e => handleStaticTemplateClick(e, templateLink)}
  aria-label={`${templateLink.name} ${t('template')}`}
>
```

#### 12b. Seção "Templates UNESP" no dropdown

Adicionar o tipo logo após os imports existentes (antes dos outros tipos):

```tsx
type LocalTemplate = {
  id: string
  name: string
  description: string
}
```

Dentro da função `NewProjectButton`, adicionar após `const portalTemplates`:

```tsx
const localTemplates: LocalTemplate[] = getMeta('ol-localTemplates') || []
```

Adicionar a função `createFromLocalTemplate` (usando `useCallback`):

```tsx
const createFromLocalTemplate = useCallback((templateId: string) => {
  const csrfToken = getMeta('ol-csrfToken')
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `/project/new/local-template/${templateId}`
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = '_csrf'
  input.value = csrfToken
  form.appendChild(input)
  document.body.appendChild(form)
  form.submit()
}, [])
```

No JSX, após o item "Upload Project" e antes do bloco `docxImportEnabled`, inserir:

```tsx
{localTemplates.length > 0 && (
  <>
    <DropdownDivider />
    <DropdownHeader aria-hidden="true">Templates UNESP</DropdownHeader>
    {localTemplates.map(tmpl => (
      <li role="none" key={`local-template-${tmpl.id}`}>
        <DropdownItem
          onClick={e => {
            e.stopPropagation()
            createFromLocalTemplate(tmpl.id)
          }}
        >
          {tmpl.name}
        </DropdownItem>
      </li>
    ))}
  </>
)}
```

---

### 13. `services/web/frontend/js/utils/meta.ts`

**Problema resolvido:** sem o type, o TypeScript rejeita `getMeta('ol-localTemplates')` e o template não compila.

Localizar o mapa de tipos (`MetaAttributeTypes` ou similar) e adicionar:

```typescript
'ol-localTemplates': { id: string; name: string; description: string }[]
```

---

### 14. `server-ce/runit/notifications-overleaf/run`

```bash
#!/bin/bash

NODE_PARAMS=""
if [ "$DEBUG_NODE" == "true" ]; then
    echo "running debug - notifications"
    NODE_PARAMS="--inspect=0.0.0.0:30420"
fi

source /etc/overleaf/env.sh
export LISTEN_ADDRESS=127.0.0.1

exec /sbin/setuser www-data /usr/bin/tsx /overleaf/services/notifications/app.ts >> /var/log/overleaf/notifications.log 2>&1
```

---

### 15. `server-ce/runit/docstore-overleaf/run`

```bash
#!/bin/bash

NODE_PARAMS=""
if [ "$DEBUG_NODE" == "true" ]; then
    echo "running debug - docstore"
    NODE_PARAMS="--inspect=0.0.0.0:30160"
fi

source /etc/overleaf/env.sh
export LISTEN_ADDRESS=127.0.0.1

exec /sbin/setuser www-data /usr/bin/node $NODE_PARAMS /overleaf/services/docstore/app.js >> /var/log/overleaf/docstore.log 2>&1
```

---

### 16. `server-ce/runit/filestore-overleaf/run`

```bash
#!/bin/bash

source /etc/overleaf/env.sh
export LISTEN_ADDRESS=127.0.0.1

exec /sbin/setuser www-data /usr/bin/node /overleaf/services/filestore/app.js >> /var/log/overleaf/filestore.log 2>&1
```

---

### 17. `server-ce/runit/clsi-overleaf/run`

```bash
#!/bin/bash

NODE_PARAMS=""
if [ "$DEBUG_NODE" == "true" ]; then
    echo "running debug - clsi"
    NODE_PARAMS="--inspect=0.0.0.0:30130"
fi

if [ -e '/var/run/docker.sock' ]; then
  echo ">> Setting permissions on docker socket"
  DOCKER_GROUP=$(stat -c '%g' /var/run/docker.sock)
  groupadd --non-unique --gid "${DOCKER_GROUP}" dockeronhost
  usermod -aG dockeronhost www-data
fi

source /etc/overleaf/env.sh
export LISTEN_ADDRESS=127.0.0.1

exec /sbin/setuser www-data /usr/bin/node $NODE_PARAMS /overleaf/services/clsi/app.js >> /var/log/overleaf/clsi.log 2>&1
```

---

### 18. `services/web/app/src/router.mjs`

**Problema resolvido:** CE não registrava rotas para threads de comentários, ranges do review panel nem templates locais.

#### 18a. Imports a adicionar (junto aos outros imports no topo do arquivo)

```js
import ThreadsController from './Features/Chat/ThreadsController.mjs'
import RangesController from './Features/Ranges/RangesController.mjs'
import LocalTemplatesRouter from './Features/Templates/LocalTemplatesRouter.mjs'
```

#### 18b. Rotas de ranges (aba Overview do review panel)

Adicionar antes das rotas de metadata:

```js
webRouter.get(
  '/project/:project_id/ranges',
  AsyncLocalStorage.middleware,
  AuthorizationMiddleware.ensureUserCanReadProject,
  AuthenticationController.requireLogin(),
  RangesController.getProjectRanges
)
```

#### 18c. Rotas de threads (comentários do review panel)

Adicionar após o bloco `if (Features.hasFeature('chat')) { ... }`:

```js
// Review panel comment threads
webRouter.get(
  '/project/:project_id/threads',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanReadProject,
  ThreadsController.getThreads
)
webRouter.post(
  '/project/:project_id/thread/:thread_id/messages',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanWriteOrReviewProjectContent,
  ThreadsController.addComment
)
webRouter.post(
  '/project/:project_id/doc/:doc_id/thread/:thread_id/resolve',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanDeleteOrResolveThread,
  ThreadsController.resolveThread
)
webRouter.post(
  '/project/:project_id/doc/:doc_id/thread/:thread_id/reopen',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanWriteOrReviewProjectContent,
  ThreadsController.reopenThread
)
webRouter.delete(
  '/project/:project_id/doc/:doc_id/thread/:thread_id',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanDeleteOrResolveThread,
  ThreadsController.deleteThread
)
webRouter.post(
  '/project/:project_id/thread/:thread_id/messages/:comment_id/edit',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanWriteOrReviewProjectContent,
  ThreadsController.editMessage
)
webRouter.delete(
  '/project/:project_id/thread/:thread_id/messages/:comment_id',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanWriteOrReviewProjectContent,
  ThreadsController.deleteMessage
)
webRouter.delete(
  '/project/:project_id/thread/:thread_id/own-messages/:comment_id',
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanWriteOrReviewProjectContent,
  ThreadsController.deleteOwnMessage
)
```

#### 18d. Rota de templates locais

Adicionar após `TemplatesRouter.apply(webRouter)`:

```js
LocalTemplatesRouter.apply(webRouter)
```

---

### 19. `services/web/app/src/Features/Chat/ThreadsController.mjs` — ARQUIVO NOVO

**Problema resolvido:** rota `POST /project/.../thread/.../messages` retornava 404 no CE porque o controller não existia.

Criar o arquivo com o conteúdo completo:

```js
import { expressify } from '@overleaf/promise-utils'
import ChatApiHandler from './ChatApiHandler.mjs'
import ChatManager from './ChatManager.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import UserInfoManager from '../User/UserInfoManager.mjs'
import UserInfoController from '../User/UserInfoController.mjs'
import logger from '@overleaf/logger'

async function getThreads(req, res) {
  const { project_id: projectId } = req.params
  const threads = await ChatApiHandler.promises.getThreads(projectId)
  await ChatManager.promises.injectUserInfoIntoThreads(threads)
  res.json(threads)
}

async function addComment(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  logger.debug({ projectId, threadId, userId }, 'adding comment to thread')
  const comment = await ChatApiHandler.promises.sendComment(
    projectId, threadId, userId, content
  )
  const user = await UserInfoManager.promises.getPersonalInfo(comment.user_id)
  comment.user = UserInfoController.formatPersonalInfo(user)
  EditorRealTimeController.emitToRoom(projectId, 'new-comment', threadId, comment)
  res.sendStatus(204)
}

async function resolveThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  await ChatApiHandler.promises.resolveThread(projectId, threadId, userId)
  const user = await UserInfoManager.promises.getPersonalInfo(userId)
  const formattedUser = UserInfoController.formatPersonalInfo(user)
  EditorRealTimeController.emitToRoom(projectId, 'resolve-thread', threadId, formattedUser)
  res.sendStatus(204)
}

async function reopenThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  await ChatApiHandler.promises.reopenThread(projectId, threadId)
  EditorRealTimeController.emitToRoom(projectId, 'reopen-thread', threadId)
  res.sendStatus(204)
}

async function deleteThread(req, res) {
  const { project_id: projectId, thread_id: threadId } = req.params
  await ChatApiHandler.promises.deleteThread(projectId, threadId)
  EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)
  res.sendStatus(204)
}

async function editMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } = req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)
  await ChatApiHandler.promises.editMessage(projectId, threadId, commentId, userId, content)
  EditorRealTimeController.emitToRoom(projectId, 'edit-message', threadId, commentId, content)
  res.sendStatus(204)
}

async function deleteMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } = req.params
  await ChatApiHandler.promises.deleteMessage(projectId, threadId, commentId)
  EditorRealTimeController.emitToRoom(projectId, 'delete-message', threadId, commentId)
  res.sendStatus(204)
}

async function deleteOwnMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  await ChatApiHandler.promises.deleteUserMessage(projectId, threadId, userId, commentId)
  EditorRealTimeController.emitToRoom(projectId, 'delete-message', threadId, commentId)
  res.sendStatus(204)
}

export default {
  getThreads: expressify(getThreads),
  addComment: expressify(addComment),
  resolveThread: expressify(resolveThread),
  reopenThread: expressify(reopenThread),
  deleteThread: expressify(deleteThread),
  editMessage: expressify(editMessage),
  deleteMessage: expressify(deleteMessage),
  deleteOwnMessage: expressify(deleteOwnMessage),
}
```

---

### 20. `services/web/app/src/Features/Ranges/RangesController.mjs` — ARQUIVO NOVO

**Problema resolvido:** aba "Overview" do review panel chamava `GET /project/:id/ranges` que não existia no CE, causando "Something went wrong".

Criar o diretório `Features/Ranges/` e o arquivo:

```js
import DocstoreManager from '../Docstore/DocstoreManager.mjs'
import { expressify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'

async function getProjectRanges(req, res) {
  const { project_id: projectId } = req.params
  logger.debug({ projectId }, 'getting all ranges for project')
  const docs = await DocstoreManager.promises.getAllRanges(projectId)
  const result = (docs || []).map(doc => ({
    id: doc._id?.toString(),
    ranges: {
      changes: doc.ranges?.changes ?? [],
      comments: doc.ranges?.comments ?? [],
    },
  }))
  res.json(result)
}

export default {
  getProjectRanges: expressify(getProjectRanges),
}
```

---

### 21. `services/web/app/src/Features/Templates/LocalTemplatesController.mjs` — ARQUIVO NOVO

**Problema resolvido:** permite criar projetos a partir de ZIPs locais em `/var/lib/overleaf/data/local-templates/`.

```js
import path from 'node:path'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import crypto from 'node:crypto'
import Settings from '@overleaf/settings'
import SessionManager from '../Authentication/SessionManager.mjs'
import ProjectUploadManager from '../Uploads/ProjectUploadManager.mjs'
import { expressify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'

const TEMPLATES_DIR = '/var/lib/overleaf/data/local-templates'

function _loadTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return []

  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter(name => {
      const dir = path.join(TEMPLATES_DIR, name)
      return (
        fs.statSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, 'template.zip'))
      )
    })
    .map(name => {
      const metaPath = path.join(TEMPLATES_DIR, name, 'metadata.json')
      let meta = { name, description: '' }
      if (fs.existsSync(metaPath)) {
        try {
          meta = { name, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) }
        } catch (e) {
          logger.warn({ err: e, templateId: name }, 'failed to parse template metadata')
        }
      }
      return { id: name, ...meta }
    })
}

async function listTemplates(req, res) {
  const templates = _loadTemplates()
  res.render('templates/local-templates', { templates, csrfToken: req.csrfToken() })
}

async function createFromTemplate(req, res) {
  const { templateId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)

  if (!/^[\w-]+$/.test(templateId)) {
    return res.status(400).send('Invalid template ID')
  }

  const zipPath = path.join(TEMPLATES_DIR, templateId, 'template.zip')
  const metaPath = path.join(TEMPLATES_DIR, templateId, 'metadata.json')

  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('Template not found')
  }

  let templateName = templateId
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      if (meta.name) templateName = meta.name
    } catch (e) {}
  }

  const tmpPath = path.join(
    Settings.path.uploadFolder,
    `local-template-${crypto.randomUUID()}.zip`
  )
  try {
    await fsp.copyFile(zipPath, tmpPath)
    const { project } =
      await ProjectUploadManager.promises.createProjectFromZipArchiveWithName(
        userId,
        templateName,
        tmpPath
      )
    res.redirect(`/project/${project._id}`)
  } catch (err) {
    logger.error({ err, templateId, zipPath, tmpPath }, 'error creating project from local template')
    res.status(500).send('Erro ao criar projeto a partir do template')
  } finally {
    fsp.unlink(tmpPath).catch(() => {})
  }
}

export default {
  listTemplates: expressify(listTemplates),
  createFromTemplate: expressify(createFromTemplate),
}
```

> Estrutura esperada no servidor:
> ```
> /var/lib/overleaf/data/local-templates/
>   abntex2/
>     template.zip
>     metadata.json   ← { "name": "ABNTex2", "description": "..." }
>   moderncv/
>     template.zip
>     metadata.json
> ```

---

### 22. `services/web/app/src/Features/Templates/LocalTemplatesRouter.mjs` — ARQUIVO NOVO

```js
import AuthenticationController from '../Authentication/AuthenticationController.mjs'
import LocalTemplatesController from './LocalTemplatesController.mjs'

export default {
  apply(app) {
    app.get(
      '/local-templates',
      AuthenticationController.requireLogin(),
      LocalTemplatesController.listTemplates
    )
    app.post(
      '/project/new/local-template/:templateId',
      AuthenticationController.requireLogin(),
      LocalTemplatesController.createFromTemplate
    )
  },
}
```

---

### 23. `services/web/app/src/Features/Project/ProjectListController.mjs`

**Problema resolvido:** a meta tag `ol-localTemplates` precisa ser populada no servidor para o React ler.

Adicionar imports no topo do arquivo (se não existirem):

```js
import fs from 'node:fs'
import path from 'node:path'
```

Adicionar a função `_loadLocalTemplates` antes de `projectListPage`:

```js
function _loadLocalTemplates() {
  const dir = '/var/lib/overleaf/data/local-templates'
  if (!fs.existsSync(dir)) return []
  try {
    return fs
      .readdirSync(dir)
      .filter(name => {
        const d = path.join(dir, name)
        return fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, 'template.zip'))
      })
      .map(name => {
        const metaPath = path.join(dir, name, 'metadata.json')
        let meta = { name, description: '' }
        if (fs.existsSync(metaPath)) {
          try { meta = { name, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) } } catch (e) {}
        }
        return { id: name, ...meta }
      })
  } catch (e) {
    return []
  }
}
```

Dentro de `projectListPage`, adicionar antes do `res.render(...)`:

```js
const localTemplates = _loadLocalTemplates()
```

Adicionar `localTemplates` ao objeto passado para `res.render`.

---

### 24. `services/web/app/views/project/list-react.pug`

Adicionar após a linha `meta(name='ol-portalTemplates' ...)`:

```pug
meta(name='ol-localTemplates' data-type='json' content=localTemplates)
```

---

### 25. `docker-compose.yml` (no servidor `/srv/overleaf/`)

Environment completo do serviço `sharelatex`:

```yaml
environment:
  OVERLEAF_APP_NAME: "Overleaf UNESP"
  OVERLEAF_NAV_TITLE: "Overleaf UNESP"
  OVERLEAF_SITE_URL: https://overleaf.unesp.br
  OVERLEAF_ADMIN_EMAIL: ti@unesp.br
  OVERLEAF_MONGO_URL: mongodb://mongo/sharelatex
  OVERLEAF_REDIS_HOST: redis
  REDIS_HOST: redis
  ENABLED_LINKED_FILE_TYPES: project_file,project_output_file
  ENABLE_CONVERSIONS: "true"
  EMAIL_CONFIRMATION_DISABLED: "true"

  # E-mail SMTP sem autenticação
  OVERLEAF_EMAIL_FROM_ADDRESS: "noreply@unesp.br"
  OVERLEAF_EMAIL_SMTP_HOST: "200.145.6.21"
  OVERLEAF_EMAIL_SMTP_PORT: "25"
  OVERLEAF_EMAIL_SMTP_SECURE: "false"
  OVERLEAF_EMAIL_SMTP_IGNORE_TLS: "true"
  OVERLEAF_EMAIL_DRIVER: "smtp"

  # Link de templates no menu New Project (abre em nova aba)
  OVERLEAF_TEMPLATE_LINKS: '[{"name":"Galeria Overleaf","url":"https://www.overleaf.com/latex/templates","trackingKey":"overleaf"}]'

  # LDAP
  OVERLEAF_LDAP_HOST: 200.145.6.59
  OVERLEAF_LDAP_PORT: 389
  OVERLEAF_LDAP_BIND_DN: cn=update,dc=unesp,dc=br
  OVERLEAF_LDAP_BIND_CREDENTIALS: COLOQUE_A_SENHA_AQUI
  OVERLEAF_LDAP_SEARCH_BASE: dc=unesp,dc=br
  OVERLEAF_LDAP_SEARCH_FILTER: (mail={{username}})
  OVERLEAF_LDAP_EMAIL_ATT: mail
  OVERLEAF_LDAP_NAME_ATT: givenName
  OVERLEAF_LDAP_LAST_NAME_ATT: sn
  OVERLEAF_LDAP_UPDATE_USER_DETAILS_ON_LOGIN: "true"
```

Volumes do serviço `sharelatex`:

```yaml
volumes:
  - /srv/overleaf-dados/sharelatex:/var/lib/overleaf
  - /srv/overleaf-dados/texlive:/usr/local/texlive
  - /srv/overleaf-dados/login.pug:/overleaf/services/web/app/views/user/login.pug
  - /srv/overleaf-dados/logo_Unesp.png:/overleaf/services/web/public/img/unesp-logo.png
  - /srv/overleaf-dados/SA01.gif:/overleaf/services/web/public/img/SA01.gif
```

---

### 26. `/srv/overleaf-dados/login.pug` (volume montado, sem rebuild)

Página de login UNESP: logo acima do formulário, card com bordas arredondadas, fundo cinza-médio, navbar fina na cor #1F3765, título H3 centralizado, sem link "Esqueceu a senha?".

```pug
extends ../layout-website-redesign

block vars
	- isWebsiteRedesign = true

append css
	style.
		.content {
			background-color: #b8bfc8 !important;
			min-height: 100vh;
		}
		.login-card {
			background-color: #f0f2f5;
			border-radius: 10px;
			padding: 32px 36px;
			box-shadow: 0 4px 18px rgba(0,0,0,0.15);
		}
		.login-card .page-header h3 {
			text-align: center;
			margin-bottom: 20px;
		}
		.navbar-main {
			background-color: #1F3765 !important;
			min-height: unset !important;
			padding-top: 4px !important;
			padding-bottom: 4px !important;
		}
		.navbar-main .navbar-brand,
		.navbar-main .nav-link,
		.navbar-main button {
			padding-top: 2px !important;
			padding-bottom: 2px !important;
			font-size: 0.85rem !important;
			color: #ffffff !important;
		}
		.navbar-main .navbar-title,
		.navbar-main .navbar-title span {
			color: #ffffff !important;
		}

block content
	main#main-content.content
		.container
			.row
				.col-lg-6.offset-lg-3.col-xl-4.offset-xl-4
					.text-center.mb-4
						img(src='/img/unesp-logo.png' alt='UNESP' style='height:70px;')
					.login-card
						.page-header
							if login_support_title
								h3 !{login_support_title}
							else
								h3 #{translate("log_in")}
						form(name='loginForm' data-ol-async-form action='/login' method='POST')
							input(name='_csrf' type='hidden' value=csrfToken)
							+formMessagesNewStyle
							+customFormMessageNewStyle('invalid-password-retry-or-reset', 'danger')
								| !{translate('email_or_password_wrong_try_again_or_reset', {}, [{ name: 'a', attrs: { href: '/user/password/reset', 'aria-describedby': 'resetPasswordDescription' } }])}
								span.visually-hidden(id='resetPasswordDescription')
									| #{translate('reset_password_link')}
							+customFormMessageNewStyle('password-compromised')
								| !{translate('password_compromised_try_again_or_use_known_device_or_reset', {}, [{name: 'a', attrs: {href: 'https://haveibeenpwned.com/passwords', rel: 'noopener noreferrer', target: '_blank'}}, {name: 'a', attrs: {href: '/user/password/reset', target: '_blank'}}])}.
							.form-group
								label(for='email') #{translate("email")}
								input#email.form-control(
									name='email'
									type='email'
									required
									autofocus='true'
									autocomplete='username'
								)
							.form-group
								label(for='password') #{translate("password")}
								input#password.form-control(
									name='password'
									type='password'
									autocomplete='current-password'
									required
								)
							.actions
								button.btn-primary.btn(type='submit' data-ol-disabled-inflight)
									span(data-ol-inflight='idle') #{translate("login")}
									span(hidden data-ol-inflight='pending') #{translate("logging_in")}…
							if login_support_text
								hr
								p.text-center !{login_support_text}
```

---

## NOTAS PARA CONFLITOS COMUNS

- Se `AuthenticationController.mjs` for reescrito e a estrutura de `passportLogin` mudar: o princípio é o mesmo — tornar a estratégia `passport.authenticate` condicional baseado em `Settings.ldap?.enable`.
- Se `moduleImportSequence` sumir de `settings.defaults.js`: verificar como módulos são registrados na nova versão e registrar `ldap-authentication` de forma equivalente.
- O nome do arquivo `.cjs` do Yarn no Dockerfile muda a cada versão — verificar com `ls .yarn/releases/` antes de aplicar.
- Após rebuild, se usuários antigos não tiverem track changes ativo:
  ```bash
  docker exec sharelatex mongosh sharelatex --eval 'db.users.updateMany({}, {$set: {"features.trackChanges": true}})'
  ```
- O limite de colaboradores (`collaborators: 10`) está em `server-ce/config/settings.js`. Para alterar, só mudar esse valor e rebuildar.
- Os arquivos SA01.gif e logo_Unesp.png devem existir em `/srv/overleaf-dados/` antes de subir o container.
- Para verificar qual service name usar no sv restart: `docker exec sharelatex ls /etc/service/`
- Se `sv restart <nome>` falhar: usar `docker restart sharelatex`.

---

## HOTFIX EXTRA (2026-05-19) — Suporte a figuras `.eps` no CE customizado

**Sintoma:** `pdflatex` falha com erro do `pdftex.def` dizendo que não encontra arquivo `.eps`.

**Causa provável no build custom:** imagem base sem `ghostscript` e sem componentes `epstopdf` no TeX Live mínimo.

**Correção aplicada:**

Arquivo: `server-ce/Dockerfile-base`

1. No `apt-get install`, adicionar:
```dockerfile
ghostscript \
```

2. No `tlmgr install`, adicionar:
```dockerfile
epstopdf \
epstopdf-pkg \
```

**Deploy necessário:** rebuild da imagem base + rebuild da imagem principal CE.

### Complemento (2026-05-19) — `latexmkrc` para conversão EPS

Mesmo com `ghostscript` + `epstopdf` instalados, a conversão `.eps` pode não ocorrer
se o engine PDF rodar sem shell habilitado. Para isso, em:

`server-ce/config/latexmkrc`

adicionar:

```perl
$pdflatex = 'pdflatex -shell-escape %O %S';
$xelatex  = 'xelatex -shell-escape %O %S';
$lualatex = 'lualatex -shell-escape %O %S';
```

`-shell-restricted` pode falhar para alguns cenários de `epstopdf`.
`-shell-escape` garante a geração do arquivo `*-eps-converted-to.pdf`.

---

## VALIDADO EM PRODUCAO (2026-05-20) - Correcao definitiva de EPS

### Sintoma observado apos rebuild

- O log mostrava `runsystem(repstopdf ... )...executed`, mas o arquivo
  `*-eps-converted-to.pdf` **nao era criado**.
- `which repstopdf` e `which epstopdf` no container retornavam vazio.
- `which gs` existia (`/usr/bin/gs`).

### Causa raiz confirmada

- A imagem final `overleaf-ce` em execucao nao tinha `repstopdf/epstopdf` no `PATH`.
- A solucao que dependia de `command -v epstopdf` no `Dockerfile-base` nao foi
  suficiente no ambiente final.

### O que de fato funcionou

1. Manter `ghostscript` instalado.
2. Manter `-shell-escape` no `server-ce/config/latexmkrc`.
3. Criar wrappers **diretamente na imagem final** (`server-ce/Dockerfile`),
   independentes do `epstopdf` do TeX Live:

```dockerfile
RUN printf '#!/bin/sh\nset -eu\nout=""\nin=""\nfor a in "$@"; do\n  case "$a" in\n    --outfile=*) out="${a#--outfile=}" ;;\n    --restricted) ;;\n    *) in="$a" ;;\n  esac\ndone\n[ -n "$in" ] || exit 2\n[ -n "$out" ] || out="${in%.eps}.pdf"\nexec gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dEPSCrop -sOutputFile="$out" "$in"\n' > /usr/local/bin/epstopdf && \
    chmod +x /usr/local/bin/epstopdf && \
    ln -sf /usr/local/bin/epstopdf /usr/local/bin/repstopdf
```

> Observacao: este `RUN` precisa estar no `server-ce/Dockerfile` para garantir
> presenca dos binarios na imagem `overleaf-ce` usada pelo `docker-compose`.

### Verificacao pos-deploy

Executar:

```bash
docker exec sharelatex bash -lc 'which repstopdf; which epstopdf; which gs'
```

Resultado esperado:

```text
/usr/local/bin/repstopdf
/usr/local/bin/epstopdf
/usr/bin/gs
```
