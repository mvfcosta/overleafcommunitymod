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
    projectId,
    threadId,
    userId,
    content
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

  EditorRealTimeController.emitToRoom(
    projectId,
    'resolve-thread',
    threadId,
    formattedUser
  )
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
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } =
    req.params
  const { content } = req.body
  const userId = SessionManager.getLoggedInUserId(req.session)

  await ChatApiHandler.promises.editMessage(
    projectId,
    threadId,
    commentId,
    userId,
    content
  )

  EditorRealTimeController.emitToRoom(
    projectId,
    'edit-message',
    threadId,
    commentId,
    content
  )
  res.sendStatus(204)
}

async function deleteMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } =
    req.params

  await ChatApiHandler.promises.deleteMessage(projectId, threadId, commentId)

  EditorRealTimeController.emitToRoom(
    projectId,
    'delete-message',
    threadId,
    commentId
  )
  res.sendStatus(204)
}

async function deleteOwnMessage(req, res) {
  const { project_id: projectId, thread_id: threadId, comment_id: commentId } =
    req.params
  const userId = SessionManager.getLoggedInUserId(req.session)

  await ChatApiHandler.promises.deleteUserMessage(
    projectId,
    threadId,
    userId,
    commentId
  )

  EditorRealTimeController.emitToRoom(
    projectId,
    'delete-message',
    threadId,
    commentId
  )
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
