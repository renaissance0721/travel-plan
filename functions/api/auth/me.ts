import { getAuthenticatedUser } from '../../_lib/auth'
import { errorResponse, jsonResponse, type AppContext } from '../../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../../_lib/schema'

export async function onRequestGet(context: AppContext) {
  try {
    await ensureAppSchema(context.env)
    const user = await getAuthenticatedUser(context.request, context.env)
    return jsonResponse({ user })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to restore the session.'), 500, { user: null })
  }
}
