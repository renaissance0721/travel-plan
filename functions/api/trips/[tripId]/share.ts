import { getAuthenticatedUser } from '../../../_lib/auth'
import { errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../../../_lib/http'
import { shareTripWithUser } from '../../../_lib/trips'

type TripParams = {
  tripId: string
}

type ShareBody = {
  email?: string
}

export async function onRequestPost(context: AppContext<TripParams>) {
  const user = await getAuthenticatedUser(context.request, context.env)
  if (!user) {
    return errorResponse('请先登录后再分享旅行。', 401)
  }

  const body = await parseJsonBody<ShareBody>(context.request)
  const email = body?.email?.trim() ?? ''
  if (!email) {
    return errorResponse('请输入要分享给对方的账号邮箱。')
  }

  try {
    const trips = await shareTripWithUser(context.env, user, context.params.tripId, email)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '分享旅行失败。', 400)
  }
}
