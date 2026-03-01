// ─── Scripted mission routes for end-to-end testing ───
// Activate via: localStorage.setItem('carmen_scripted_route', 'route_a')
// Deactivate:   localStorage.removeItem('carmen_scripted_route')

import { CITY_POOL_MAP } from './cityRegistry'

export const SCRIPTED_ROUTES = {
  route_a: {
    name: 'The European Pursuit',
    homeCityId: 80002,              // Santiago
    path: [80002, 971, 421614],     // Santiago → Berlin → Tokyo
    captureCity: 421614,            // Tokyo
    carmenWallet: '0x00C4a4eE1A54aBE4de20a2AB9E7B1F72eC0d5a37',
  },
  route_b: {
    name: 'The Silk Road Chase',
    homeCityId: 512,                // Rio de Janeiro
    path: [512, 84532, 11155113],   // Rio → Paris → Dubai
    captureCity: 11155113,          // Dubai
    carmenWallet: '0x00B3b3dD2B43fACd5cf19a1BA8E6A0F61dC0e4b26',
  },
}

export const ROUTE_STORAGE_KEY = 'carmen_scripted_route'

export function getActiveRoute() {
  try {
    const key = localStorage.getItem(ROUTE_STORAGE_KEY)
    if (!key) return null
    return SCRIPTED_ROUTES[key] ? { key, ...SCRIPTED_ROUTES[key] } : null
  } catch {
    return null
  }
}

export function setActiveRoute(routeKey) {
  localStorage.setItem(ROUTE_STORAGE_KEY, routeKey)
}

export function clearActiveRoute() {
  localStorage.removeItem(ROUTE_STORAGE_KEY)
}

/**
 * Determine a city's role relative to a scripted route.
 * - 'on_path':  city is part of the route path
 * - 'near_path': city shares a chainId with a path city (but is not on the path itself)
 * - 'off_path':  city is completely unrelated to the route
 */
export function getCityRole(route, cityId) {
  if (!route) return 'off_path'
  if (route.path.includes(cityId)) return 'on_path'

  // check if city shares a chainId with any path city
  const city = CITY_POOL_MAP[cityId]
  if (!city) return 'off_path'

  const pathChainIds = new Set(route.path.map((id) => CITY_POOL_MAP[id]?.chainId).filter(Boolean))
  if (pathChainIds.has(city.chainId)) return 'near_path'

  return 'off_path'
}

/**
 * Get the next city in the route after the given city.
 * Returns null if the city is the last in the path or not on the path.
 */
export function getNextCity(route, currentCityId) {
  if (!route) return null
  const idx = route.path.indexOf(currentCityId)
  if (idx === -1 || idx >= route.path.length - 1) return null
  return route.path[idx + 1]
}

/**
 * Get the correct city on the path that shares a chainId with the given off-path city.
 * Used for "near_path" redirects.
 */
export function getNearestPathCity(route, cityId) {
  if (!route) return null
  const city = CITY_POOL_MAP[cityId]
  if (!city) return null
  return route.path.find((pathId) => CITY_POOL_MAP[pathId]?.chainId === city.chainId) ?? null
}
