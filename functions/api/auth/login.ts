import {
  buildSessionCookie,
  createSession,
  getAuthenticatedUser,
  normalizeEmail,
  verifyPassword,
} from '../../_lib/auth'
import { errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../../_lib/schema'

type LoginBody = {
  email?: string
  password?: string
}

type UserRow = {
  id: string
  email: string
  password_hash: string
}

export async function onRequestPost(context: AppContext) {
  try {
    await ensureAppSchema(context.env)

    const existingSessionUser = await getAuthenticatedUser(context.request, context.env)
    if (existingSessionUser) {
      return jsonResponse({ user: existingSessionUser })
    }

    const body = await parseJsonBody<LoginBody>(context.request)
    const email = normalizeEmail(body?.email ?? '')
    const password = body?.password ?? ''

    const user = await context.env.DB.prepare(
      'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1',
    )
      .bind(email)
      .first<UserRow>()

    if (!user) {
      return errorResponse('Incorrect email or password.', 401)
    }

    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return errorResponse('Incorrect email or password.', 401)
    }

    const session = await createSession(context.env, user.id)

    return jsonResponse(
      {
        user: {
          id: user.id,
          email: user.email,
        },
      },
      200,
      {
        'set-cookie': buildSessionCookie(session.token, session.expiresAt),
      },
    )
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to log in right now.'), 500)
  }
}
