import { db } from '../../infrastructure/mongodb.mjs'
import Mongo from '../Helpers/Mongo.mjs'
import OError from '@overleaf/o-error'
import { Project } from '../../models/Project.mjs'
import { User } from '../../models/User.mjs'
import LockManager from '../../infrastructure/LockManager.mjs'
import { DeletedProject } from '../../models/DeletedProject.mjs'
import { callbackifyAll } from '@overleaf/promise-utils'
import ProjectEntityMongoUpdateHandler from './ProjectEntityMongoUpdateHandler.mjs'
import CollaboratorsGetter from '../Collaborators/CollaboratorsGetter.mjs'

const { normalizeQuery } = Mongo

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function buildProjectsSearchQuery(search) {
  const searchValue = (search || '').trim()
  if (!searchValue) {
    return {}
  }

  const regex = new RegExp(escapeRegex(searchValue), 'i')
  const matchingOwners = await User.find({ email: regex }, { _id: 1 })
    .limit(1000)
    .lean()
    .exec()

  const ownerIds = matchingOwners.map(user => user._id)
  const query = [{ name: regex }]
  if (ownerIds.length > 0) {
    query.push({ owner_ref: { $in: ownerIds } })
  }

  return { $or: query }
}

const ProjectGetter = {
  async getProject(projectId, projection = {}) {
    if (projectId == null) {
      throw new Error('no project id provided')
    }
    if (typeof projection !== 'object') {
      throw new Error('projection is not an object')
    }

    if (projection.rootFolder || Object.keys(projection).length === 0) {
      return await LockManager.promises.runWithLock(
        ProjectEntityMongoUpdateHandler.LOCK_NAMESPACE,
        projectId,
        () => ProjectGetter.getProjectWithoutLock(projectId, projection)
      )
    } else {
      return await ProjectGetter.getProjectWithoutLock(projectId, projection)
    }
  },

  async getProjectWithoutLock(projectId, projection = {}) {
    if (projectId == null) {
      throw new Error('no project id provided')
    }
    if (typeof projection !== 'object') {
      throw new Error('projection is not an object')
    }

    const query = normalizeQuery(projectId)

    let project
    try {
      project = await db.projects.findOne(query, { projection })
    } catch (error) {
      OError.tag(error, 'error getting project', {
        query,
        projection,
      })
      throw error
    }

    return project
  },

  async getProjectIdByReadAndWriteToken(token) {
    const project = await Project.findOne(
      { 'tokens.readAndWrite': token },
      { _id: 1 }
    ).exec()

    if (project == null) {
      return
    }

    return project._id
  },

  /**
   * @return {Promise<any>}
   */
  async findAllUsersProjects(userId, fields) {
    const ownedProjects = await Project.find(
      { owner_ref: userId },
      fields
    ).exec()

    const projects =
      await CollaboratorsGetter.promises.getProjectsUserIsMemberOf(
        userId,
        fields
      )

    const result = {
      owned: ownedProjects || [],
      readAndWrite: projects.readAndWrite || [],
      readOnly: projects.readOnly || [],
      tokenReadAndWrite: projects.tokenReadAndWrite || [],
      tokenReadOnly: projects.tokenReadOnly || [],
      review: projects.review || [],
    }

    // Remove duplicate projects. The order of result values is determined by the order they occur.
    const tempAddedProjectsIds = new Set()
    const filteredProjects = Object.entries(result).reduce((prev, current) => {
      const [key, projects] = current

      prev[key] = []

      projects.forEach(project => {
        const projectId = project._id.toString()

        if (!tempAddedProjectsIds.has(projectId)) {
          prev[key].push(project)
          tempAddedProjectsIds.add(projectId)
        }
      })

      return prev
    }, {})

    return filteredProjects
  },

  async existUsersDebugProjectsOlderThan(userId, days) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const exists = await Project.exists({
      owner_ref: userId,
      'overleaf.isDebugCopyOf': { $type: 'objectId' },
      lastUpdated: { $lt: cutoffDate },
    })

    return Boolean(exists)
  },

  async findAllDebugProjects(fields) {
    return Project.find(
      {
        'overleaf.isDebugCopyOf': { $type: 'objectId' },
      },
      fields
    )
      .limit(500)
      .populate('owner_ref', ['email', 'name'])
      .exec()
  },

  async countProjects({ search = '' } = {}) {
    const query = await buildProjectsSearchQuery(search)
    return await Project.countDocuments(query).exec()
  },

  async findProjectsWithOwners({ limit = 500, skip = 0, search = '' } = {}) {
    const query = await buildProjectsSearchQuery(search)

    return await Project.find(query, 'name owner_ref lastUpdated')
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner_ref', ['email', 'first_name', 'last_name'])
      .exec()
  },

  /**
   * Return all projects with the given name that belong to the given user.
   *
   * Projects include the user's own projects as well as collaborations with
   * read/write access.
   */
  async findUsersProjectsByName(userId, projectName) {
    const allProjects = await ProjectGetter.findAllUsersProjects(
      userId,
      'name archived trashed'
    )

    const { owned, readAndWrite } = allProjects
    const projects = owned.concat(readAndWrite)
    const lowerCasedProjectName = projectName.toLowerCase()
    return projects.filter(
      project => project.name.toLowerCase() === lowerCasedProjectName
    )
  },

  async getUsersDeletedProjects(userId) {
    return await DeletedProject.find({
      'deleterData.deletedProjectOwnerId': userId,
    }).exec()
  },
}

export default {
  ...callbackifyAll(ProjectGetter),
  promises: ProjectGetter,
}