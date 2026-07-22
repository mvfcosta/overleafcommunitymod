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

  // Copia o ZIP para a pasta temporária de uploads antes de processar,
  // pois o ProjectUploadManager espera um arquivo descartável nessa pasta.
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
