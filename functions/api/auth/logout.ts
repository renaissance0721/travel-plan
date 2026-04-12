import { clearSessionCookie, deleteSessionFromRequest } from '../../_lib/auth'
import { errorResponse, jsonResponse, type AppContext } from '../../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../../_lib/schema'

export async function onRequestPost(context: AppContext) {
  try {
    await ensureAppSchema(context.env)
    await deleteSessionFromRequest(context.request, context.env)

    return jsonResponse(
      { ok: true },
      200,
      {
        'set-cookie': clearSessionCookie(),
      },
    )
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to log out right now.'), 500)
  }
}
