# Be-Electric Next.js prototype

A responsive EV charging finder built with Next.js, React, Leaflet, and OpenStreetMap tiles.

## Run locally

1. Install Node.js 18 or later.
2. Extract this folder and open it in a terminal.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open http://localhost:3000.


## Map notes

- The map uses Leaflet and OpenStreetMap standard raster tiles.
- Pan by dragging, zoom with the mouse wheel or pinch gesture, and tap a station marker to view it.
- Station details and coordinates are demo data around Doha Qatar, not verified live charging locations.
- OpenStreetMap attribution is included in the map. Follow the OpenStreetMap tile usage policy for production traffic.


Mobile layout update: both the station details sheet and route preview sheet have a consistent pill-style drag handle, capped height, and internal scrolling. The selected Leaflet popup is hidden while route preview is active to reduce overlap.
