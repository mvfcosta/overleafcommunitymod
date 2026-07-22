/**
 * ldap-authentication/index.mjs
 *
 * Módulo Overleaf para autenticação via LDAP/Active Directory.
 *
 * Integra-se ao sistema de módulos do Overleaf através do hook 'passportSetup',
 * registrando a estratégia 'ldapauth' do passport quando a configuração
 * Settings.ldap.enable estiver ativa.
 *
 * Dependências externas (já presentes em package.json):
 *   - passport-ldapauth ^2.1.4
 */

import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import { Strategy as LdapStrategy } from 'passport-ldapauth'
import LdapAuthManager from './app/src/LdapAuthManager.mjs'

// ─── Hook: passportSetup ──────────────────────────────────────────────────────

/**
 * Chamado pelo sistema de módulos (Modules.mjs) durante a inicialização do servidor,
 * logo após o registro da estratégia 'local' em Server.mjs.
 *
 * Registra a estratégia 'ldapauth' apenas quando LDAP estiver configurado
 * (Settings.ldap.enable === true), evitando qualquer impacto em instalações
 * que usam autenticação local.
 *
 * @param {import('passport').PassportStatic} passport - Instância global do Passport
 * @returns {Promise<void>}
 */
async function passportSetup(passport) {
  if (!Settings.ldap?.enable) {
    // LDAP não configurado: módulo carregado mas sem efeito
    return
  }

  // Constrói a URL do servidor LDAP (ldap:// ou ldaps:// para TLS)
  const protocol = Settings.ldap.secure ? 'ldaps' : 'ldap'
  const port = Settings.ldap.port || (Settings.ldap.secure ? 636 : 389)
  const serverUrl = `${protocol}://${Settings.ldap.host}:${port}`

  /**
   * Opções para o servidor LDAP:
   *
   * - url           → endereço do servidor (ex.: ldap://dc.empresa.com:389)
   * - bindDN        → DN da conta de serviço usada para pesquisar usuários
   * - bindCredentials → senha da conta de serviço
   * - searchBase    → raiz da busca (ex.: ou=users,dc=empresa,dc=com)
   * - searchFilter  → filtro LDAP com {{username}} substituído pelo e-mail digitado
   * - tlsOptions    → opções de TLS (ex.: { rejectUnauthorized: false } para certs self-signed)
   */
  const ldapServerOptions = {
    url: serverUrl,
    bindDN: Settings.ldap.bindDN,
    bindCredentials: Settings.ldap.bindCredentials,
    searchBase: Settings.ldap.searchBase,
    searchFilter: Settings.ldap.searchFilter || '(mail={{username}})',
    tlsOptions: Settings.ldap.tlsOptions || {},
  }

  passport.use(
    'ldapauth',
    new LdapStrategy(
      {
        server: ldapServerOptions,
        // Campo do formulário de login que contém o nome de usuário/e-mail
        usernameField: 'email',
        // Campo do formulário de login que contém a senha
        passwordField: 'password',
        // Permite acessar req dentro do callback para auditoria futura
        passReqToCallback: true,
      },
      /**
       * Callback de verificação chamado pelo passport-ldapauth após bind LDAP bem-sucedido.
       *
       * @param {import('express').Request} req
       * @param {Object} ldapUser - Perfil do usuário retornado pelo servidor LDAP
       * @param {Function} done - Callback do Passport: done(err, user | false, info?)
       */
      async (req, ldapUser, done) => {
        try {
          // Provisiona ou atualiza a conta local correspondente ao usuário LDAP
          const user = await LdapAuthManager.findOrCreateUser(ldapUser)
          done(null, user)
        } catch (err) {
          logger.err(
            { err, ldapUser: { dn: ldapUser.dn } },
            'LDAP: error provisioning user after successful bind'
          )
          done(err)
        }
      }
    )
  )

  logger.debug(
    { url: serverUrl, searchBase: Settings.ldap.searchBase },
    'LDAP: passport strategy registered'
  )
}

// ─── Exportação do módulo ─────────────────────────────────────────────────────

/**
 * Objeto de módulo seguindo a interface WebModule do Overleaf.
 * O hook 'passportSetup' é invocado em Server.mjs via:
 *   Modules.hooks.fire('passportSetup', passport, callback)
 */
const LdapAuthenticationModule = {
  hooks: {
    promises: {
      passportSetup,
    },
  },
}

export default LdapAuthenticationModule
