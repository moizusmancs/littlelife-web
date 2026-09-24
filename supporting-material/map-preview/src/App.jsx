import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Rectangle, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import demo from './demo-islamabad-rwp.json'
import newData from '../new.json'
import rawManifest from '../manifest.json'
import rawMetrics from '../metrics.json'
import pakistanOutline from './pakistan-outline.json'
import {
  people,
  shelters,
  petrolPumps,
  pharmacies,
  infrastructure,
  incidentReports,
  missingPersonReports,
} from './demo-markers'

// Same color stops your ML teammate already uses for the PNG heatmaps
// (white/green -> yellow -> red, low -> high flood probability), so this
// preview visually matches what the "real" version will eventually look like.
const STOPS = [
  { p: 0.0, color: [247, 252, 245] },  // #f7fcf5
  { p: 0.33, color: [65, 171, 93] },   // #41ab5d
  { p: 0.66, color: [255, 255, 51] },  // #ffff33
  { p: 1.0, color: [227, 26, 28] },    // #e31a1c
]

function probabilityToColor(p) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]
    const b = STOPS[i + 1]
    if (p >= a.p && p <= b.p) {
      const t = (p - a.p) / (b.p - a.p)
      const rgb = a.color.map((c, idx) => Math.round(c + t * (b.color[idx] - c)))
      return `rgb(${rgb.join(',')})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].color.join(',')})`
}

// Plain emoji "logos" via a divIcon -- no external icon image files needed,
// and avoids Leaflet's well-known broken-default-marker-icon issue with
// bundlers entirely, since we never touch L.Icon.Default.
function emojiIcon(emoji, bg, size = 26) {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};box-shadow:0 1px 4px rgba(0,0,0,0.5);font-size:${Math.round(size * 0.6)}px;">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const PERSON_ICON = emojiIcon('🧍', '#ffffff', 22)
const MISSING_ICON = emojiIcon('🚨', '#e74c3c', 30)
const INCIDENT_ICON = emojiIcon('🚧', '#f39c12', 26)
const statusColor = (status) => (status === 'safe' ? '#2ecc71' : '#f39c12')

function facilityIcon(emoji, open) {
  return emojiIcon(emoji, open ? '#2ecc71' : '#e74c3c', 26)
}

// The raw manifest.json (temporary, unfiltered ML export) uses different
// field names than the existing demo/new datasets -- these two accessors
// paper over that so the rest of the rendering code doesn't care which
// dataset is currently selected.
function getLeafletBounds(patch) {
  return patch.leaflet_bounds ?? patch.bounds_leaflet
}
function getPeakProb(patch) {
  return patch.peak_probability ?? patch.peak_prob
}

// Coloring by peak_prob paints a whole ~64km box solid red for a single hot
// pixel (peak_prob is near-binary: mostly exact 0 or 1). mean_prob reflects
// how much of the box the model actually thinks is flooded, so use that for
// color when it's available (only the raw manifest has it) and fall back to
// peak_prob for datasets that don't (demo/new).
function getColorProb(patch) {
  return patch.mean_prob ?? getPeakProb(patch)
}

// Bounding box covering every patch in a dataset, so we can fit/zoom the
// map to whichever dataset is currently selected.
function datasetBounds(patches) {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity
  for (const p of patches) {
    const [[s, w], [n, e]] = getLeafletBounds(p)
    if (s < south) south = s
    if (w < west) west = w
    if (n > north) north = n
    if (e > east) east = e
  }
  return [[south, west], [north, east]]
}

// Ray-casting point-in-polygon test, used to drop patches whose center
// falls outside the Pakistan outline (coords are [lon, lat], GeoJSON order).
function pointInPolygon([lon, lat], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

const PAKISTAN_RING = pakistanOutline.features[0].geometry.coordinates[0]

function isInsidePakistan(patch) {
  const [[south, west], [north, east]] = getLeafletBounds(patch)
  return pointInPolygon([(west + east) / 2, (south + north) / 2], PAKISTAN_RING)
}

function ringBounds(ring) {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity
  for (const [lon, lat] of ring) {
    if (lat < south) south = lat
    if (lon < west) west = lon
    if (lat > north) north = lat
    if (lon > east) east = lon
  }
  return [[south, west], [north, east]]
}

// The real country shape, not the patch grid, so the zoom-out floor below
// matches "the whole map of Pakistan" regardless of which dataset/threshold
// is currently selected.
const PAKISTAN_BOUNDS = ringBounds(PAKISTAN_RING)

function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] })
  }, [bounds, map])
  return null
}

// Stops the user from zooming out past the point where all of Pakistan is
// already visible — going further would just show empty space around it.
function ZoomOutLock({ bounds }) {
  const map = useMap()
  useEffect(() => {
    function applyFloor() {
      // Same padding as FitBounds uses, so the floor lines up with "the whole
      // country, framed the way we already show it" rather than a tighter crop.
      const floorZoom = map.getBoundsZoom(bounds, false, L.point(20, 20))
      map.setMinZoom(floorZoom)
      if (map.getZoom() < floorZoom) map.setZoom(floorZoom)
    }
    applyFloor()
    map.on('resize', applyFloor)
    return () => map.off('resize', applyFloor)
  }, [bounds, map])
  return null
}

const LOCATE_ZOOM = 14

// Google-Maps-style "you are here" dot rather than a full marker pin, since
// this is the viewer's own position, not a place on the map.
const MY_LOCATION_ICON = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#4285f4;border:3px solid white;box-shadow:0 0 0 2px rgba(66,133,244,0.45), 0 1px 4px rgba(0,0,0,0.4);"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// On first load, recenter from the whole-country view to the visitor's
// actual location (if they grant permission) — falls back to leaving the
// country view in place on denial/timeout/unsupported browsers.
function LocateOnLoad({ onLocate }) {
  const map = useMap()
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude]
        map.setView(latlng, LOCATE_ZOOM)
        onLocate(latlng)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [map, onLocate])
  return null
}

function LocateButton({ onLocate }) {
  const map = useMap()
  const [locating, setLocating] = useState(false)

  function handleClick() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const latlng = [pos.coords.latitude, pos.coords.longitude]
        map.flyTo(latlng, LOCATE_ZOOM)
        onLocate(latlng)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <button
      onClick={handleClick}
      title="Go to my location"
      aria-label="Go to my location"
      style={{
        position: 'absolute',
        zIndex: 1000,
        right: 16,
        bottom: 24,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 'none',
        background: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        fontSize: 20,
        cursor: 'pointer',
      }}
    >
      {locating ? '⏳' : '📍'}
    </button>
  )
}

// Voting is an incident_reports-specific thing in the real schema
// (upvote_count/downvote_count) — shelters/pharmacies get simple
// open/closed reports, missing persons get sightings, neither of those has
// a vote concept. "One vote per account" mirrors the real
// UNIQUE(incident_report_id, account_id) constraint: once you vote, the
// buttons lock and just show what you picked.
function IncidentReportMarker({ report }) {
  const [upvotes, setUpvotes] = useState(report.upvotes)
  const [downvotes, setDownvotes] = useState(report.downvotes)
  const [myVote, setMyVote] = useState(null) // null | 'up' | 'down'

  function vote(direction) {
    if (myVote) return
    if (direction === 'up') setUpvotes((n) => n + 1)
    else setDownvotes((n) => n + 1)
    setMyVote(direction)
  }

  return (
    <Marker position={report.position} icon={INCIDENT_ICON}>
      <Popup>
        <div style={{ minWidth: 170 }}>
          <strong>Incident report — blocked road</strong>
          <div style={{ margin: '8px 0', fontSize: 15 }}>
            👍 {upvotes} &nbsp;&nbsp; 👎 {downvotes}
          </div>
          {myVote ? (
            <div style={{ fontSize: 12, color: '#666' }}>
              You voted {myVote === 'up' ? '👍 up' : '👎 down'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => vote('up')}>👍 Upvote</button>
              <button onClick={() => vote('down')}>👎 Downvote</button>
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

export default function App() {
  const [dataset, setDataset] = useState('new') // 'new' | 'demo' | 'raw'
  const [minProb, setMinProb] = useState(0.9)
  const [myLocation, setMyLocation] = useState(null)
  const isDemo = dataset === 'demo'
  const isRaw = dataset === 'raw'
  const patches = isDemo ? demo.patches : isRaw ? rawManifest : newData.patches
  // Bounds come from every patch, not the filtered set, so raising the
  // threshold thins out boxes without the map re-zooming on you.
  const bounds = useMemo(() => datasetBounds(patches), [patches])
  const visiblePatches = useMemo(
    () => patches.filter((p) => getPeakProb(p) >= minProb && isInsidePakistan(p)),
    [patches, minProb],
  )

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 1000,
          top: 0,
          left: 0,
          right: 0,
          background: isDemo ? '#e31a1c' : isRaw ? '#8e44ad' : '#1f6f43',
          color: 'white',
          padding: '8px 12px',
          fontFamily: 'sans-serif',
          fontSize: 14,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>
          {isDemo
            ? 'SYNTHETIC DEMO DATA — illustrative flood near Islamabad/Rawalpindi, not from the real model'
            : isRaw
              ? `RAW MANIFEST (temporary) — ${rawMetrics.total_samples.toLocaleString()} patches · precision ${(rawMetrics.precision * 100).toFixed(0)}% · recall ${(rawMetrics.recall * 100).toFixed(0)}% · F1 ${(rawMetrics.f1_dice * 100).toFixed(0)}% · epoch ${rawMetrics.model_epoch} · test year ${rawMetrics.test_year}`
              : `MODEL OUTPUT — ${newData.n_patches.toLocaleString()} patches, real flood-risk predictions`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setDataset('new')}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontWeight: dataset === 'new' ? 700 : 400,
              background: dataset === 'new' ? 'white' : 'rgba(255,255,255,0.25)',
              color: dataset === 'new' ? '#1f6f43' : 'white',
            }}
          >
            New data
          </button>
          <button
            onClick={() => setDataset('raw')}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontWeight: dataset === 'raw' ? 700 : 400,
              background: dataset === 'raw' ? 'white' : 'rgba(255,255,255,0.25)',
              color: dataset === 'raw' ? '#8e44ad' : 'white',
            }}
          >
            Raw manifest (all)
          </button>
          <button
            onClick={() => setDataset('demo')}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontWeight: dataset === 'demo' ? 700 : 400,
              background: dataset === 'demo' ? 'white' : 'rgba(255,255,255,0.25)',
              color: dataset === 'demo' ? '#e31a1c' : 'white',
            }}
          >
            Demo
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Min probability: {Math.round(minProb * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minProb}
            onChange={(e) => setMinProb(Number(e.target.value))}
          />
          <span style={{ opacity: 0.85 }}>
            ({visiblePatches.length.toLocaleString()}/{patches.length.toLocaleString()} shown)
          </span>
        </label>
      </div>
      <MapContainer
        center={[30, 70]}
        zoom={5}
        preferCanvas
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds bounds={bounds} />
        <ZoomOutLock bounds={PAKISTAN_BOUNDS} />
        <LocateOnLoad onLocate={setMyLocation} />
        <LocateButton onLocate={setMyLocation} />

        {myLocation && (
          <Marker position={myLocation} icon={MY_LOCATION_ICON}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Flood risk boxes (from the model, colored by mean probability where
            available so one hot pixel doesn't paint the whole ~64km box solid
            red; thresholded on peak probability and lightened so roads/labels
            stay readable underneath) */}
        {visiblePatches.map((patch, i) => {
          const peakProb = getPeakProb(patch)
          const color = probabilityToColor(getColorProb(patch))
          return (
            <Rectangle
              key={patch.png_filename ?? `${patch.row}-${patch.col}-${i}`}
              bounds={getLeafletBounds(patch)}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 1, opacity: 0.35 }}
            >
              <Popup>
                <strong>{patch.png_filename ?? `row ${patch.row}, col ${patch.col}`}</strong>
                <br />
                peak probability: {(peakProb * 100).toFixed(1)}%
                {patch.mean_prob != null && (
                  <>
                    <br />
                    mean probability: {(patch.mean_prob * 100).toFixed(1)}%
                  </>
                )}
                {patch.patch_iou != null && (
                  <>
                    <br />
                    patch IoU: {patch.patch_iou.toFixed(4)}
                  </>
                )}
              </Popup>
            </Rectangle>
          )
        })}

        {/* Synthetic citizen/facility/report markers only make sense over the
            small Islamabad/Rawalpindi demo area, not the country-wide model output */}
        {isDemo && (
          <>
            {/* Citizens */}
            {people.map((p) => (
              <Marker key={p.id} position={p.position} icon={PERSON_ICON}>
                <Popup>Citizen</Popup>
              </Marker>
            ))}

            {/* Shelters */}
            {shelters.map((s) => (
              <Marker key={s.id} position={s.position} icon={facilityIcon('🏠', s.open)}>
                <Popup>
                  Shelter — {s.open ? 'Open' : 'Closed'}
                </Popup>
              </Marker>
            ))}

            {/* Petrol pumps */}
            {petrolPumps.map((s) => (
              <Marker key={s.id} position={s.position} icon={facilityIcon('⛽', s.open)}>
                <Popup>
                  Petrol pump — {s.open ? 'Open' : 'Closed'}
                </Popup>
              </Marker>
            ))}

            {/* Pharmacies */}
            {pharmacies.map((s) => (
              <Marker key={s.id} position={s.position} icon={facilityIcon('💊', s.open)}>
                <Popup>
                  Pharmacy — {s.open ? 'Open' : 'Closed'}
                </Popup>
              </Marker>
            ))}

            {/* Infrastructure: hospitals + bridges, colored by safe/at_risk */}
            {infrastructure.map((f) => (
              <Marker
                key={f.id}
                position={f.position}
                icon={emojiIcon(f.kind === 'hospital' ? '🏥' : '🌉', statusColor(f.status))}
              >
                <Popup>
                  {f.kind === 'hospital' ? 'Hospital' : 'Bridge'} — {f.status}
                </Popup>
              </Marker>
            ))}

            {/* Community incident reports (e.g. blocked road) — voteable */}
            {incidentReports.map((r) => (
              <IncidentReportMarker key={r.id} report={r} />
            ))}

            {/* Missing person reports — deliberately clustered in the highest-risk boxes only */}
            {missingPersonReports.map((m) => (
              <Marker key={m.id} position={m.position} icon={MISSING_ICON}>
                <Popup>Missing person report</Popup>
              </Marker>
            ))}
          </>
        )}

        {/* Country outline drawn last so it stays visible on top of the patches/markers */}
        <GeoJSON
          data={pakistanOutline}
          style={{ color: '#1a3a8f', weight: 2, fill: false }}
          interactive={false}
        />
      </MapContainer>
    </div>
  )
}
