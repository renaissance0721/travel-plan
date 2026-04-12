import { getAuthenticatedUser } from '../../_lib/auth'
import { errorResponse, jsonResponse, type AppContext } from '../../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../../_lib/schema'
import { deleteTripForOwner } from '../../_lib/trips'

type TripParams = {
  tripId: string
}

export async function onRequestDelete(context: AppContext<TripParams>) {
  try {
    await ensureAppSchema(context.env)

    const user = await getAuthenticatedUser(context.request, context.env)
    if (!user) {
      return errorResponse('Please sign in before deleting a trip.', 401)
    }

    const trips = await deleteTripForOwner(context.env, user, context.params.tripId)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to delete this trip right now.'), 403)
  }
}
