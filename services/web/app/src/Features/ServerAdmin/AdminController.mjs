import logger from '@overleaf/logger'
import http from 'node:http'
import https from 'node:https'
import Settings from '@overleaf/settings'
import TpdsUpdateSender from '../ThirdPartyDataStore/TpdsUpdateSender.mjs'
import TpdsProjectFlusher from '../ThirdPartyDataStore/TpdsProjectFlusher.mjs'
import EditorRealTimeController from '../Editor/EditorRealTimeController.mjs'
import SystemMessageManager from '../SystemMessages/SystemMessageManager.mjs'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import ProjectDeleter from '../Project/ProjectDeleter.mjs'
import { DeletedProjectReasons } from '../Project/DeletedProjectReasons.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import UserRegistrationHandler from '../User/UserRegistrationHandler.mjs'
import UserDeleter from '../User/UserDeleter.mjs'
import UserGetter from '../User/UserGetter.mjs'
import { User } from '../../models/User.mjs'
import Modules from '../../infrastructure/Modules.mjs'
import Features from '../../infrastructure/Features.mjs'
import { expressify } from '@overleaf/promise-utils'

const PROJECT_PAGE_SIZES = [20, 50, 100]
const PROJECT_SORT_FIELDS = new Set(['name', 'ownerEmail', 'createdAt', 'lastUpdated'])

function getProjectPageSize(value) {
  const pageSize = Number.parseInt(value, 10)
  return PROJECT_PAGE_SIZES.includes(pageSize) ? pageSize : 20
}

function getProjectSortDirection(value) {
  return value === 'asc' ? 'asc' : 'desc'
}

function compareProjectValues(left, right, direction) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1

  const leftValue = left instanceof Date ? left.getTime() : String(left)
  const rightValue = right instanceof Date ? right.getTime() : String(right)
  const comparison =
    typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        })

  return direction === 'asc' ? comparison : -comparison
}

function buildProjectsRedirectQuery(query) {
  const params = new URLSearchParams()
  for (const key of ['q', 'sortBy', 'sortDir', 'page', 'pageSize']) {
    if (query[key]) params.set(key, query[key])
  }
  const queryString = params.toString()
  return queryString ? '?' + queryString : ''
}


const AdminController = {
  _sendDisconnectAllUsersMessage: delay => {
    return EditorRealTimeController.emitToAll(
      'forceDisconnect',
      'Sorry, we are performing a quick update to the editor and need to close it down. Please refresh the page to continue.',
      delay
    )
  },
  index: expressify(async (req, res, next) => {
    let url
    const openSockets = {}
    for (url in http.globalAgent.sockets) {
      openSockets[`http://${url}`] = http.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    for (url in https.globalAgent.sockets) {
      openSockets[`https://${url}`] = https.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    const systemMessages =
      await SystemMessageManager.promises.getMessagesFromDB()

    const privilegesMatrixResults = await Modules.promises.hooks.fire(
      'getPrivilegesMatrix'
    )

    const privilegesMatrix = privilegesMatrixResults[0] || null

    const toRender = {
      title: 'System Admin',
      openSockets,
      systemMessages,
      privilegesMatrix,
    }

    if (Features.hasFeature('saas')) {
      const debugProjects = await ProjectGetter.promises.findAllDebugProjects(
        'name lastUpdated owner_ref'
      )
      toRender.debugProjects = debugProjects
    }
    res.render('admin/index', toRender)
  }),

  projects: expressify(async (req, res) => {
    const search = (req.query.q || '').trim()
    const sortBy = PROJECT_SORT_FIELDS.has(req.query.sortBy)
      ? req.query.sortBy
      : 'lastUpdated'
    const sortDir = getProjectSortDirection(req.query.sortDir)
    const pageSize = getProjectPageSize(req.query.pageSize)
    const requestedPage = Number.parseInt(req.query.page, 10)
    const totalProjects = await ProjectGetter.promises.countProjects()
    const filteredProjects = await ProjectGetter.promises.countProjects({ search })

    const projectsRaw = await ProjectGetter.promises.findProjectsWithOwners({
      limit: Math.max(filteredProjects, 1),
      skip: 0,
      search,
    })

    const allProjects = projectsRaw.map(project => {
      const createdAt =
        typeof project._id?.getTimestamp === 'function'
          ? project._id.getTimestamp()
          : null

      return {
        id: project._id?.toString(),
        name: project.name,
        ownerEmail: project.owner_ref?.email || 'Sem dono',
        createdAt,
        lastUpdated: project.lastUpdated || null,
      }
    })

    allProjects.sort((left, right) =>
      compareProjectValues(left[sortBy], right[sortBy], sortDir)
    )

    const pageCount = Math.max(1, Math.ceil(filteredProjects / pageSize))
    const page = Math.min(
      Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1),
      pageCount
    )
    const projects = allProjects.slice((page - 1) * pageSize, page * pageSize)
    const pageNumbers = [...new Set([1, 2, 3, pageCount - 2, pageCount - 1, pageCount])]
      .filter(pageNumber => pageNumber >= 1 && pageNumber <= pageCount)
      .sort((left, right) => left - right)
    const sortLinks = {}
    for (const field of PROJECT_SORT_FIELDS) {
      const nextDirection = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc'
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      params.set('sortBy', field)
      params.set('sortDir', nextDirection)
      params.set('pageSize', pageSize)
      sortLinks[field] = '/admin/projects?' + params.toString()
    }

    res.render('admin/projects', {
      title: 'Admin - Projects',
      totalProjects,
      filteredProjects,
      search,
      projects,
      page,
      pageCount,
      pageSize,
      pageSizes: PROJECT_PAGE_SIZES,
      sortBy,
      sortDir,
      sortLinks,      pageNumbers,
    })
  }),

  externalUsers: expressify(async (req, res) => {
    const users = await User.find({ authProvider: 'local-invite' })
      .select('_id email first_name last_name signUpDate lastActive')
      .sort({ signUpDate: -1 })
      .lean()
    res.render('admin/external-users', {
      title: 'Usuários externos',
      users,
      query: req.query,
    })
  }),

  resetExternalUserPassword: expressify(async (req, res) => {
    const user = await UserGetter.promises.getUser({
      _id: req.params.user_id,
      authProvider: 'local-invite',
    })
    if (!user) return res.sendStatus(404)
    await UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail(
      user.email
    )
    res.redirect('/admin/external-users?reset=1')
  }),

  deleteExternalUser: expressify(async (req, res) => {
    const user = await UserGetter.promises.getUser({
      _id: req.params.user_id,
      authProvider: 'local-invite',
    })
    if (!user) return res.sendStatus(404)
    await UserDeleter.promises.deleteMongoUser(user._id)
    res.redirect('/admin/external-users?deleted=1')
  }),

  deleteProjects: expressify(async (req, res) => {
    const projectIds = [
      ...(Array.isArray(req.body.project_ids)
        ? req.body.project_ids
        : [req.body.project_ids]),
    ].filter(Boolean)
    const uniqueProjectIds = [...new Set(projectIds)]
    const user = SessionManager.getSessionUser(req.session)

    await Promise.all(
      uniqueProjectIds.map(projectId =>
        ProjectDeleter.promises.deleteProject(projectId, {
          deleterUser: user,
          ipAddress: req.ip,
          deletedReason: DeletedProjectReasons.USER,
        })
      )
    )

    res.redirect('/admin/projects' + buildProjectsRedirectQuery(req.query))
  }),

  deleteProject: expressify(async (req, res) => {
    const projectId = req.params.project_id
    const user = SessionManager.getSessionUser(req.session)

    await ProjectDeleter.promises.deleteProject(projectId, {
      deleterUser: user,
      ipAddress: req.ip,
      deletedReason: DeletedProjectReasons.USER,
    })

    res.redirect('/admin/projects' + buildProjectsRedirectQuery(req.query))
  }),
  disconnectAllUsers: (req, res) => {
    logger.warn('disconecting everyone')
    const delay = (req.query && req.query.delay) > 0 ? req.query.delay : 10
    AdminController._sendDisconnectAllUsersMessage(delay)
    res.redirect('/admin#open-close-editor')
  },

  openEditor(req, res) {
    logger.warn('opening editor')
    Settings.editorIsOpen = true
    res.redirect('/admin#open-close-editor')
  },

  closeEditor(req, res) {
    logger.warn('closing editor')
    Settings.editorIsOpen = req.body.isOpen
    res.redirect('/admin#open-close-editor')
  },

  flushProjectToTpds(req, res, next) {
    TpdsProjectFlusher.flushProjectToTpds(req.body.project_id, error => {
      if (error) {
        return next(error)
      }
      res.sendStatus(200)
    })
  },

  pollDropboxForUser(req, res) {
    const { user_id: userId } = req.body
    TpdsUpdateSender.pollDropboxForUser(userId, () => res.sendStatus(200))
  },

  createMessage(req, res, next) {
    SystemMessageManager.createMessage(req.body.content, function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  clearMessages(req, res, next) {
    SystemMessageManager.clearMessages(function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },
}

export default AdminController
