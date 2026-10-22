/**
 * LdapAuthManager.mjs
 *
 * Responsável pelo provisionamento de usuários autenticados via LDAP.
 * Após um bind LDAP bem-sucedido, garante que o usuário existe localmente
 * no MongoDB e, opcionalmente, mantém seus dados sincronizados com o diretório.
 */

import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import UserCreator from '../../../../app/src/Features/User/UserCreator.mjs'
import UserUpdater from '../../../../app/src/Features/User/UserUpdater.mjs'
import EmailHelper from '../../../../app/src/Features/Helpers/EmailHelper.mjs'

// ─── Extratores de atributos LDAP ─────────────────────────────────────────────

/**
 * Extrai e normaliza o endereço de e-mail do objeto de usuário LDAP.
 * O nome do atributo é configurável via Settings.ldap.emailAtt (padrão: 'mail').
 *
 * @param {Object} ldapUser - Objeto retornado pelo passport-ldapauth após bind
 * @returns {string|null} E-mail normalizado (minúsculas, sem espaços) ou null se inválido
 */
function _extractEmail(ldapUser) {
  const emailAtt = Settings.ldap?.emailAtt || 'mail'
  // Tenta o atributo configurado primeiro, depois fallbacks comuns
  const rawEmail =
    ldapUser[emailAtt] || ldapUser.mail || ldapUser.email || ldapUser.userPrincipalName
  return EmailHelper.parseEmail(rawEmail)
}

/**
 * Extrai o primeiro nome do objeto de usuário LDAP.
 * O nome do atributo é configurável via Settings.ldap.firstNameAtt (padrão: 'givenName').
 *
 * @param {Object} ldapUser
 * @returns {string}
 */
function _extractFirstName(ldapUser) {
  const att = Settings.ldap?.firstNameAtt || 'givenName'
  return (ldapUser[att] || ldapUser.givenName || '').trim()
}

/**
 * Extrai o sobrenome do objeto de usuário LDAP.
 * O nome do atributo é configurável via Settings.ldap.lastNameAtt (padrão: 'sn').
 *
 * @param {Object} ldapUser
 * @returns {string}
 */
function _extractLastName(ldapUser) {
  const att = Settings.ldap?.lastNameAtt || 'sn'
  return (ldapUser[att] || ldapUser.sn || '').trim()
}

// ─── Provisionamento de usuário ───────────────────────────────────────────────

/**
 * Localiza um usuário Overleaf existente pelo e-mail LDAP ou cria um novo.
 *
 * Fluxo:
 *  1. Extrai e valida o e-mail do perfil LDAP.
 *  2. Busca o usuário no MongoDB pelo e-mail.
 *  3. Se não existir → cria uma conta local sem senha (autenticação exclusivamente via LDAP).
 *  4. Se existir e Settings.ldap.updateUserDetailsOnLogin=true → atualiza nome e sobrenome.
 *
 * @param {Object} ldapUser - Perfil LDAP retornado após bind bem-sucedido
 * @returns {Promise<Object>} Documento de usuário do MongoDB pronto para serialização na sessão
 * @throws {Error} Se o usuário LDAP não possuir um e-mail válido
 */
async function findOrCreateUser(ldapUser) {
  const email = _extractEmail(ldapUser)

  if (!email) {
    // Sem e-mail não é possível criar/identificar a conta local — falha com detalhe
    throw new OError('LDAP user has no valid email address', {
      ldapAttUsed: Settings.ldap?.emailAtt || 'mail',
      ldapUserKeys: Object.keys(ldapUser),
    })
  }

  const firstName = _extractFirstName(ldapUser)
  const lastName = _extractLastName(ldapUser)

  // Busca conta existente por qualquer e-mail (principal ou aliases)
  let user = await UserGetter.promises.getUserByAnyEmail(email)

  if (!user) {
    /**
     * Primeiro login deste usuário LDAP: provisionamento automático da conta.
     *
     * Nota: não definimos hashedPassword — a conta só pode ser autenticada via LDAP.
     * O campo holdingAccount=false garante que a conta é tratada como ativa imediatamente.
     */
    logger.debug({ email }, 'LDAP: provisioning new local account')

    user = await UserCreator.promises.createNewUser({
      email,
      first_name: firstName,
      last_name: lastName,
      holdingAccount: false,
      authProvider: 'ldap',
    })

    logger.debug({ email, userId: user._id }, 'LDAP: new account provisioned')
  } else {
    const update = { $set: { authProvider: 'ldap' } }
    if (Settings.ldap?.updateUserDetailsOnLogin) {
      update.$set.first_name = firstName
      update.$set.last_name = lastName
    }
    await UserUpdater.promises.updateUser(user._id, update)

    user.authProvider = 'ldap'
    if (Settings.ldap?.updateUserDetailsOnLogin) {
      user.first_name = firstName
      user.last_name = lastName
    }
  }

  return user
}

export default {
  findOrCreateUser,
  // Exportados para uso nos testes unitários
  _extractEmail,
  _extractFirstName,
  _extractLastName,
}
