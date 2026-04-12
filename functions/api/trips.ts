import { getAuthenticatedUser } from '../_lib/auth'
import { errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../_lib/http'
import { getAccessibleTrips, syncTripsForUser } from '../_lib/trips'

type TripsRequestBody = {
  trips?: unknown[]
}

export async function onRequestGet(context: AppContext) {
  const user = await getAuthenticatedUser(context.request, context.env)
  if (!user) {
    return errorResponse('请先登录后再查看旅行数据。', 401)
  }

  const trips = await getAccessibleTrips(context.env, user)
  return jsonResponse({ trips })
}

export async function onRequestPost(context: AppContext) {
  const user = await getAuthenticatedUser(context.request, context.env)
  if (!user) {
    return errorResponse('请先登录后再保存旅行数据。', 401)
  }

  const body = await parseJsonBody<TripsRequestBody>(context.request)
  if (!body || !Array.isArray(body.trips)) {
    return errorResponse('请求体里需要包含 trips 数组。')
  }

  try {
    const trips = await syncTripsForUser(context.env, user, body.trips as never[])
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '保存旅行数据失败。', 400)
  }
}
