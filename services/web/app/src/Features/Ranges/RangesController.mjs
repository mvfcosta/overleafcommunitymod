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
