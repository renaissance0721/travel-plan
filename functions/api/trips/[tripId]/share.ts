import { getAuthenticatedUser } from '../../../_lib/auth'
import { errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../../../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../../../_lib/schema'
import { removeTripShareForUser, shareTripWithUser } from '../../../_lib/trips'

type TripParams = {
  tripId: string
}

type ShareBody = {
  email?: string
}

export async function onRequestPost(context: AppContext<TripParams>) {
  try {
    await ensureAppSchema(context.env)

    const user = await getAuthenticatedUser(context.request, context.env)
    if (!user) {
      return errorResponse('Please sign in before sharing a trip.', 401)
    }

    const body = await parseJsonBody<ShareBody>(context.request)
    const email = body?.email?.trim() ?? ''
    if (!email) {
      return errorResponse('Please enter the email address you want to share with.')
    }

    const trips = await shareTripWithUser(context.env, user, context.params.tripId, email)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to share this trip right now.'), 400)
  }
}

export async function onRequestDelete(context: AppContext<TripParams>) {
  try {
    await ensureAppSchema(context.env)

    const user = await getAuthenticatedUser(context.request, context.env)
    if (!user) {
      return errorResponse('Please sign in before updating trip sharing.', 401)
    }

    const body = await parseJsonBody<ShareBody>(context.request)
    const email = body?.email?.trim() ?? ''
    if (!email) {
      return errorResponse('Please enter the email address you want to remove.')
    }

    const trips = await removeTripShareForUser(context.env, user, context.params.tripId, email)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to update the sharing list right now.'), 400)
  }
}
