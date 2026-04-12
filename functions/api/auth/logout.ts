import { clearSessionCookie, deleteSessionFromRequest } from '../../_lib/auth'
import { jsonResponse, type AppContext } from '../../_lib/http'

export async function onRequestPost(context: AppContext) {
  await deleteSessionFromRequest(context.request, context.env)

  return jsonResponse(
    { ok: true },
    200,
    {
      'set-cookie': clearSessionCookie(),
    },
  )
}
