import { getAuthenticatedUser } from '../../_lib/auth'
import { errorResponse, jsonResponse, type AppContext } from '../../_lib/http'
import { deleteTripForOwner } from '../../_lib/trips'

type TripParams = {
  tripId: string
}

export async function onRequestDelete(context: AppContext<TripParams>) {
  const user = await getAuthenticatedUser(context.request, context.env)
  if (!user) {
    return errorResponse('请先登录后再删除旅行。', 401)
  }

  try {
    const trips = await deleteTripForOwner(context.env, user, context.params.tripId)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '删除旅行失败。', 403)
  }
}
