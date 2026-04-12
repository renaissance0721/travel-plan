import { getAuthenticatedUser } from '../../_lib/auth'
import { jsonResponse, type AppContext } from '../../_lib/http'

export async function onRequestGet(context: AppContext) {
  const user = await getAuthenticatedUser(context.request, context.env)
  return jsonResponse({ user })
}
