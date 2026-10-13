# Be-Electric Next.js prototype

A responsive EV charging finder built with Next.js, React, Leaflet, and OpenStreetMap tiles.

## Run locally

1. Install Node.js 18 or later.
2. Extract this folder and open it in a terminal.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open http://localhost:3000.

## Deploy to Vercel

Push this folder to a GitHub repository, import it in Vercel, and deploy with the default Next.js settings. No environment variables are needed for this demo.

## Map notes

- The map uses Leaflet and OpenStreetMap standard raster tiles.
- Pan by dragging, zoom with the mouse wheel or pinch gesture, and tap a station marker to view it.
- Station details and coordinates are demo data around San Francisco, not verified live charging locations.
- The displayed route is a visual preview line, not turn-by-turn road routing. For real road routes, integrate a routing service such as OSRM or openrouteservice.
- OpenStreetMap attribution is included in the map. Follow the OpenStreetMap tile usage policy for production traffic.
