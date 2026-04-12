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
import { ensureAppSchema, getDatabaseErrorMessage } from '../../_lib/schema'

type RegisterBody = {
  email?: string
  password?: string
}

type ExistingUserRow = {
  id: string
}

export async function onRequestPost(context: AppContext) {
  try {
    await ensureAppSchema(context.env)

    const existingSessionUser = await getAuthenticatedUser(context.request, context.env)
    if (existingSessionUser) {
      return jsonResponse({ user: existingSessionUser })
    }

    const body = await parseJsonBody<RegisterBody>(context.request)
    const email = normalizeEmail(body?.email ?? '')
    const password = body?.password ?? ''

    if (!isValidEmail(email)) {
      return errorResponse('Please enter a valid email address.')
    }

    if (!isValidPassword(password)) {
      return errorResponse('Password must be at least 8 characters long.')
    }

    const existingUser = await context.env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<ExistingUserRow>()

    if (existingUser) {
      return errorResponse('This email address has already been registered.', 409)
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
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to register right now.'), 500)
  }
}
