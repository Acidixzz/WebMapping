/**
 * One representative point per state (capital) for Search Box `proximity` bias.
 * Each “Add” search runs a forward query from every anchor and merges unique POIs.
 */
export type StateSearchAnchor = {
  readonly state: string
  readonly lng: number
  readonly lat: number
}

/** US state capitals — lng/lat (WGS84). */
export const US_STATE_SEARCH_ANCHORS: readonly StateSearchAnchor[] = [
  { state: 'Alabama', lng: -86.3001, lat: 32.3668 },
  { state: 'Alaska', lng: -134.4197, lat: 58.3019 },
  { state: 'Arizona', lng: -112.074, lat: 33.4484 },
  { state: 'Arkansas', lng: -92.2896, lat: 34.7465 },
  { state: 'California', lng: -121.4944, lat: 38.5816 },
  { state: 'Colorado', lng: -104.9903, lat: 39.7392 },
  { state: 'Connecticut', lng: -72.6734, lat: 41.7658 },
  { state: 'Delaware', lng: -75.5268, lat: 39.1582 },
  { state: 'Florida', lng: -84.2807, lat: 30.4383 },
  { state: 'Georgia', lng: -84.388, lat: 33.749 },
  { state: 'Hawaii', lng: -157.8583, lat: 21.3069 },
  { state: 'Idaho', lng: -116.2023, lat: 43.615 },
  { state: 'Illinois', lng: -89.6501, lat: 39.7817 },
  { state: 'Indiana', lng: -86.1581, lat: 39.7684 },
  { state: 'Iowa', lng: -93.625, lat: 41.5868 },
  { state: 'Kansas', lng: -95.689, lat: 39.0473 },
  { state: 'Kentucky', lng: -84.8733, lat: 38.2009 },
  { state: 'Louisiana', lng: -91.1871, lat: 30.4515 },
  { state: 'Maine', lng: -69.7653, lat: 44.3235 },
  { state: 'Maryland', lng: -76.4922, lat: 38.9784 },
  { state: 'Massachusetts', lng: -71.0589, lat: 42.3601 },
  { state: 'Michigan', lng: -84.5467, lat: 42.7325 },
  { state: 'Minnesota', lng: -93.09, lat: 44.9537 },
  { state: 'Mississippi', lng: -90.1848, lat: 32.2988 },
  { state: 'Missouri', lng: -92.1735, lat: 38.5767 },
  { state: 'Montana', lng: -112.0391, lat: 46.5891 },
  { state: 'Nebraska', lng: -96.7026, lat: 40.8136 },
  { state: 'Nevada', lng: -119.7674, lat: 39.1638 },
  { state: 'New Hampshire', lng: -71.5376, lat: 43.2081 },
  { state: 'New Jersey', lng: -74.7564, lat: 40.2206 },
  { state: 'New Mexico', lng: -105.9378, lat: 35.687 },
  { state: 'New York', lng: -73.7562, lat: 42.6526 },
  { state: 'North Carolina', lng: -78.6382, lat: 35.7796 },
  { state: 'North Dakota', lng: -100.7837, lat: 46.8208 },
  { state: 'Ohio', lng: -82.9988, lat: 39.9612 },
  { state: 'Oklahoma', lng: -97.5164, lat: 35.4676 },
  { state: 'Oregon', lng: -123.0351, lat: 44.9429 },
  { state: 'Pennsylvania', lng: -76.8867, lat: 40.2732 },
  { state: 'Rhode Island', lng: -71.4128, lat: 41.824 },
  { state: 'South Carolina', lng: -81.0348, lat: 34.0007 },
  { state: 'South Dakota', lng: -100.351, lat: 44.3683 },
  { state: 'Tennessee', lng: -86.7816, lat: 36.1627 },
  { state: 'Texas', lng: -97.7431, lat: 30.2672 },
  { state: 'Utah', lng: -111.891, lat: 40.7608 },
  { state: 'Vermont', lng: -72.5754, lat: 44.2601 },
  { state: 'Virginia', lng: -77.436, lat: 37.5407 },
  { state: 'Washington', lng: -122.9007, lat: 47.0379 },
  { state: 'West Virginia', lng: -81.6326, lat: 38.3498 },
  { state: 'Wisconsin', lng: -89.3838, lat: 43.0748 },
  { state: 'Wyoming', lng: -104.8202, lat: 41.14 },
]
