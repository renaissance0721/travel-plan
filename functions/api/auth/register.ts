import {
  buildSessionCookie,
  createSession,
  getAuthenticatedUser,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
} from '../../_lib/auth'
import { createServerId, errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../../_lib/http'

type RegisterBody = {
  email?: string
  password?: string
}

type ExistingUserRow = {
  id: string
}

export async function onRequestPost(context: AppContext) {
  const existingSessionUser = await getAuthenticatedUser(context.request, context.env)
  if (existingSessionUser) {
    return jsonResponse({ user: existingSessionUser })
  }

  const body = await parseJsonBody<RegisterBody>(context.request)
  const email = normalizeEmail(body?.email ?? '')
  const password = body?.password ?? ''

  if (!isValidEmail(email)) {
    return errorResponse('请输入有效的账号邮箱。')
  }

  if (!isValidPassword(password)) {
    return errorResponse('密码至少需要 8 位。')
  }

  const existingUser = await context.env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<ExistingUserRow>()

  if (existingUser) {
    return errorResponse('这个邮箱已经注册过了，请直接登录。', 409)
  }

  const userId = createServerId(16)
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()

  await context.env.DB.prepare(
    `
      INSERT INTO users (id, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  )
    .bind(userId, email, passwordHash, now, now)
    .run()

  const session = await createSession(context.env, userId)

  return jsonResponse(
    {
      user: {
        id: userId,
        email,
      },
    },
    201,
    {
      'set-cookie': buildSessionCookie(session.token, session.expiresAt),
    },
  )
}
