import { renderToStaticMarkup } from 'react-dom/server'
import { divIcon, type DivIcon } from 'leaflet'
import { BankIcon, BridgeIcon, HospitalIcon, HouseLineIcon, LightningIcon, PillIcon, ShoppingCartIcon, TentIcon } from '@phosphor-icons/react'
import type { MapPlace, Tone } from './mapModel'

/** The design system's status colours as hex — Leaflet draws these outside Tailwind. */
export const TONE_COLOR: Record<Tone, string> = {
  safe: '#2e9e5b',
  caution: '#e0a100',
  critical: '#d42e2e',
  neutral: '#7a5a68',
}

const SIZE = { shelter: 34, infrastructure: 30, essential: 26 } as const

/** The icon for a kind of place — a house or tent, a hospital, a pill, a cart, a bank. White by default, for the map's coloured discs. */
export function placeGlyph(place: MapPlace, size: number, color = '#ffffff') {
  const props = { weight: 'fill' as const, size, color }
  switch (place.kind) {
    case 'shelter':
      return place.data.type === 'relief_center' ? <TentIcon {...props} /> : <HouseLineIcon {...props} />
    case 'infrastructure':
      return place.data.type === 'hospital' ? <HospitalIcon {...props} /> : place.data.type === 'bridge' ? <BridgeIcon {...props} /> : <LightningIcon {...props} />
    case 'essential':
      return place.data.type === 'atm' ? <BankIcon {...props} /> : place.data.type === 'grocery_store' ? <ShoppingCartIcon {...props} /> : <PillIcon {...props} />
  }
}

const cache = new Map<string, DivIcon>()

/**
 * A round marker in the place's status colour with its kind's glyph inside — plain HTML (no image files, so none of
 * Leaflet's well-known broken-default-marker-icon problem under a bundler). Shelters are drawn largest, and the
 * selected place gets a ring and a slight enlargement. Cached, because the same few icons are reused constantly and
 * `Marker` re-applies an icon whenever the object changes.
 */
export function placeIcon(place: MapPlace, selected: boolean): DivIcon {
  const type = 'type' in place.data ? place.data.type : ''
  const key = `${place.kind}:${type}:${place.tone}:${selected ? 1 : 0}`
  const cached = cache.get(key)
  if (cached) return cached
  const base = SIZE[place.kind]
  const size = selected ? base + 6 : base
  const ring = selected ? 'box-shadow:0 0 0 4px rgba(242,71,125,0.45),0 2px 6px rgba(34,16,25,0.4);' : 'box-shadow:0 1px 4px rgba(34,16,25,0.45);'
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${TONE_COLOR[place.tone]};border:2px solid #fff;${ring}">${renderToStaticMarkup(placeGlyph(place, Math.round(size * 0.55)))}</div>`
  const icon = divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
  cache.set(key, icon)
  return icon
}

/** The viewer's own position: a blue dot with a soft halo (a place-free marker, unlike the rest). */
export const USER_ICON = divIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#3a5fcd;border:3px solid #fff;box-shadow:0 0 0 8px rgba(58,95,205,0.25),0 1px 4px rgba(34,16,25,0.4)"></div>',
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})
