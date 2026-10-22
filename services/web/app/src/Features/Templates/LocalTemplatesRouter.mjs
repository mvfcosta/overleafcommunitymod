import AuthenticationController from '../Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../Authorization/AuthorizationMiddleware.mjs'
import LocalTemplatesController from './LocalTemplatesController.mjs'

export default {
  apply(app) {
    app.get('/local-templates', LocalTemplatesController.listTemplates)

    app.post(
      '/project/new/local-template/:templateId',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserCanCreateProject,
      LocalTemplatesController.createFromTemplate
    )
  },
}
