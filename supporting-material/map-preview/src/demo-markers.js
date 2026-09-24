import demo from './demo-islamabad-rwp.json'

// Seeded PRNG so the "random" layout is stable across reloads instead of
// jumping around every refresh — nicer if you're showing this to someone.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)
const randomIn = (min, max) => min + rand() * (max - min)

function randomPointInBounds(bounds) {
  const [[south, west], [north, east]] = bounds
  return [randomIn(south, north), randomIn(west, east)]
}

// Overall area covering all 9 hazard boxes, slightly padded so some points
// land "along" the box edges too, not just strictly inside one.
const ALL_BOUNDS = [
  [33.37, 72.82],
  [33.83, 73.28],
]

export const people = Array.from({ length: 18 }, (_, i) => ({
  id: `person-${i}`,
  position: randomPointInBounds(ALL_BOUNDS),
}))

function randomFacilities(prefix, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    position: randomPointInBounds(ALL_BOUNDS),
    open: rand() > 0.5,
  }))
}

export const shelters = randomFacilities('shelter', 5)
export const petrolPumps = randomFacilities('petrol', 6)
export const pharmacies = randomFacilities('pharmacy', 6)

export const infrastructure = [
  { id: 'hospital-0', kind: 'hospital', status: 'safe', position: randomPointInBounds(ALL_BOUNDS) },
  { id: 'hospital-1', kind: 'hospital', status: 'at_risk', position: randomPointInBounds(ALL_BOUNDS) },
  { id: 'bridge-0', kind: 'bridge', status: 'safe', position: randomPointInBounds(ALL_BOUNDS) },
]

export const incidentReports = [
  { id: 'incident-0', position: randomPointInBounds(ALL_BOUNDS), upvotes: 12, downvotes: 2 },
  { id: 'incident-1', position: randomPointInBounds(ALL_BOUNDS), upvotes: 4, downvotes: 7 },
]

// Missing person reports cluster only inside the highest-risk hazard boxes —
// this is the one category that isn't spread randomly everywhere, since it's
// meant to show up where the danger actually is.
const highRiskBoxes = demo.patches.filter((p) => p.peak_probability > 0.5)
export const missingPersonReports = Array.from({ length: 8 }, (_, i) => ({
  id: `missing-${i}`,
  position: randomPointInBounds(highRiskBoxes[i % highRiskBoxes.length].leaflet_bounds),
}))
