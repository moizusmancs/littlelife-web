/**
 * The base map's tiles and their credit, in one place. These are OpenStreetMap's own public servers, whose usage policy doesn't
 * allow production traffic — a tile provider is needed before launch, and this is the only file to change for it.
 */
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
