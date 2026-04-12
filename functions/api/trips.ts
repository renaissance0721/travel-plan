import { getAuthenticatedUser } from '../_lib/auth'
import { errorResponse, jsonResponse, parseJsonBody, type AppContext } from '../_lib/http'
import { ensureAppSchema, getDatabaseErrorMessage } from '../_lib/schema'
import { getAccessibleTrips, syncTripsForUser } from '../_lib/trips'

type TripsRequestBody = {
  trips?: unknown[]
}

export async function onRequestGet(context: AppContext) {
  try {
    await ensureAppSchema(context.env)

    const user = await getAuthenticatedUser(context.request, context.env)
    if (!user) {
      return errorResponse('Please sign in before loading trips.', 401)
    }

    const trips = await getAccessibleTrips(context.env, user)
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to load trips right now.'), 500)
  }
}

export async function onRequestPost(context: AppContext) {
  try {
    await ensureAppSchema(context.env)

    const user = await getAuthenticatedUser(context.request, context.env)
    if (!user) {
      return errorResponse('Please sign in before saving trips.', 401)
    }

    const body = await parseJsonBody<TripsRequestBody>(context.request)
    if (!body || !Array.isArray(body.trips)) {
      return errorResponse('The request body must include a trips array.')
    }

    const trips = await syncTripsForUser(context.env, user, body.trips as never[])
    return jsonResponse({ trips })
  } catch (error) {
    return errorResponse(getDatabaseErrorMessage(error, 'Unable to save trips right now.'), 400)
  }
}
