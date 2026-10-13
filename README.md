# Be-Electric Qatar — Next.js prototype

A responsive Next.js / React phone-emulator prototype for exploring EV charging points around Doha, Qatar, with Q-Auto Qatar (Al Waab Commercial Complex, Salwa Road) as the starting point.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Map features

- Interactive OpenStreetMap tiles with pan, pinch/scroll zoom, and zoom controls.
- Q-Auto Qatar is highlighted as the main map point.
- Sample map points around Doha can be selected; station pins and filters update together.
- Search uses the public Nominatim geocoder to find places in Qatar.
- Map layer switch toggles between standard OpenStreetMap and HOT OpenStreetMap tiles.
- Google Maps, Apple Maps, and Waze options open external navigation links with Q-Auto Qatar as the origin.

## Notes

The Q-Auto pin is centered on the published Al Waab / Salwa Road location area. Confirm the exact entrance coordinates before production. Other charging pins, plug counts, status, power and prices are illustrative sample data, not verified live charger data. Search needs an internet connection. The public OpenStreetMap tile service and Nominatim geocoder have usage policies and rate limits; review them before a public production launch. Route distance/time and in-app route preview are not live route-engine results yet.

## Deploy to Vercel

Push the folder to GitHub, import it at https://vercel.com/new, and deploy with the Next.js preset.
