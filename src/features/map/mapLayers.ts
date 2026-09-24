/**
 * The layers a citizen can switch on the map. The mockup (§2f) has five chips — Flood, Shelters, Infrastructure,
 * Reports, Missing Persons. Reports and Missing Persons belong to Community (Phase 5) and Relief Operations (Phase 6),
 * which retrofit them into this map, so they aren't offered until they can show something. **Essentials** (ATMs,
 * grocery stores, pharmacies) is added: the plan lists essential-location markers for this screen and the data is real.
 */
export type LayerId = 'flood' | 'shelters' | 'infrastructure' | 'essentials'

export const LAYERS: ReadonlyArray<{ id: LayerId; label: string }> = [
  { id: 'flood', label: 'Flood' },
  { id: 'shelters', label: 'Shelters' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'essentials', label: 'Essentials' },
]

export type LayerState = Record<LayerId, boolean>

/** Flood zones and shelters are what someone opening a flood-response map needs first; the rest are a tap away. */
export const DEFAULT_LAYERS: LayerState = { flood: true, shelters: true, infrastructure: false, essentials: false }
