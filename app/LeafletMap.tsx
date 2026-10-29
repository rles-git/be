
"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapCharger } from "@/app/hooks/useStations";

type Station = {
  lat: number;
  lng: number;
  id: string;
  name: string;
  shortName: string;
  address: string;
  chargers: MapCharger[];
  available: number | null;
  power: number | null;
  price: number | null;
  kind: "DC fast" | "AC";
  distance: string;
  minutes: number;
  status: string;
};

type Props = {
  stations: Station[];
  selectedId: string;
  routeMode: boolean;
  userLocation: [number, number] | null;
  isFallbackLocation?: boolean;
  onRequestLocation?: () => void;
  onSelect: (id: string) => void;
  onRouteCalculated?: (metrics: {
    distance: string;
    minutes: number;
  }) => void;
};

function isAvailableStatus(status: unknown): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  return ["available", "online", "idle", "ready"].includes(
    normalized
  );
}

function getAvailableChargerCount(station: Station): number {
  const chargers = Array.isArray(station.chargers)
    ? station.chargers
    : [];

  if (chargers.length > 0) {
    return chargers.filter((charger) =>
      isAvailableStatus(charger.status)
    ).length;
  }

  return station.available ?? 0;
}

function stationIcon(station: Station, selected: boolean) {
  const available = getAvailableChargerCount(station);

  return L.divIcon({
    className: "leaflet-station-icon-wrap",
    html: `
      <div class="leaflet-station-icon ${
        selected ? "is-selected" : ""
      } ${available === 0 ? "is-offline" : ""}">
        <span class="bolt">ϟ</span>
        <span class="count">${available}</span>
        ${selected ? "<small>SELECTED</small>" : ""}
      </div>
    `,
    iconSize: selected ? [64, 62] : [50, 48],
    iconAnchor: selected ? [32, 31] : [25, 24],
  });
}

function MapController({
  userLocation,
  routeMode,
  onRequestLocation,
}: {
  userLocation: [number, number] | null;
  routeMode: boolean;
  onRequestLocation?: () => void;
}) {
  const map = useMap();

  const userLocationRef = useRef(userLocation);
  const routeModeRef = useRef(routeMode);
  const followEnabledRef = useRef(false);
  const isProgrammaticMoveRef = useRef(false);

  const inactivityTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const programmaticTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  userLocationRef.current = userLocation;
  routeModeRef.current = routeMode;

  useEffect(() => {
    const clearInactivityTimer = () => {
      if (inactivityTimerRef.current !== null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    const clearProgrammaticTimer = () => {
      if (programmaticTimerRef.current !== null) {
        clearTimeout(programmaticTimerRef.current);
        programmaticTimerRef.current = null;
      }
    };

    const markProgrammaticMove = () => {
      isProgrammaticMoveRef.current = true;
      clearProgrammaticTimer();

      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticMoveRef.current = false;
        programmaticTimerRef.current = null;
      }, 1000);
    };

    /**
     * Recenter and zoom in on GPS.
     * Positive pixel Y offset places the GPS marker higher
     * on screen because the geographic map center moves down.
     */
    const recenterOnGPS = (animate = true) => {
      const location = userLocationRef.current;
      if (!location) return;

      const targetZoom = 17;
      const screenOffsetY = 100;

      const gpsPoint = map.project(
        L.latLng(location[0], location[1]),
        targetZoom
      );

      gpsPoint.y += screenOffsetY;

      const offsetCenter = map.unproject(
        gpsPoint,
        targetZoom
      );

      markProgrammaticMove();

      map.flyTo(offsetCenter, targetZoom, {
        animate,
        duration: animate ? 0.8 : 0,
      });
    };

    const resumeFollowing = () => {
      inactivityTimerRef.current = null;

      if (!routeModeRef.current) return;

      followEnabledRef.current = true;
      recenterOnGPS(true);
    };

    const scheduleResume = () => {
      if (
        !routeModeRef.current ||
        isProgrammaticMoveRef.current
      ) {
        return;
      }

      followEnabledRef.current = false;
      clearInactivityTimer();

      inactivityTimerRef.current = setTimeout(
        resumeFollowing,
        5000
      );
    };

    const handleDragStart = () => {
      if (isProgrammaticMoveRef.current) return;
      scheduleResume();
    };

    const handleDrag = () => {
      if (isProgrammaticMoveRef.current) return;
      scheduleResume();
    };

    const handleZoomStart = () => {
      if (isProgrammaticMoveRef.current) return;
      scheduleResume();
    };

    const container = map.getContainer();

    const handleWheel = () => scheduleResume();
    const handleTouch = () => scheduleResume();
    const handleDoubleClick = () => scheduleResume();

    container.addEventListener("wheel", handleWheel, {
      passive: true,
    });

    container.addEventListener("touchstart", handleTouch, {
      passive: true,
    });

    container.addEventListener("touchmove", handleTouch, {
      passive: true,
    });

    container.addEventListener(
      "dblclick",
      handleDoubleClick
    );

    map.on("dragstart", handleDragStart);
    map.on("drag", handleDrag);
    map.on("zoomstart", handleZoomStart);

    const locate = () => {
      if (!userLocationRef.current) {
        onRequestLocation?.();
        return;
      }

      clearInactivityTimer();
      followEnabledRef.current = true;
      recenterOnGPS(true);
    };

    const panToStation = (event: Event) => {
      const customEvent = event as CustomEvent<{
        lat: number;
        lng: number;
      }>;

      const lat = Number(customEvent.detail?.lat);
      const lng = Number(customEvent.detail?.lng);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return;
      }

      markProgrammaticMove();

      map.flyTo(
        [lat, lng],
        Math.max(map.getZoom(), 15),
        {
          animate: true,
          duration: 0.7,
        }
      );
    };

    const refreshMapSize = () => {
      map.invalidateSize({
        pan: false,
        animate: false,
      });
    };

    window.addEventListener("be-electric-locate", locate);

    window.addEventListener(
      "be-electric-pan-to-station",
      panToStation
    );

    window.addEventListener(
      "be-electric-map-visible",
      refreshMapSize
    );

    return () => {
      clearInactivityTimer();
      clearProgrammaticTimer();

      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener(
        "touchstart",
        handleTouch
      );
      container.removeEventListener(
        "touchmove",
        handleTouch
      );
      container.removeEventListener(
        "dblclick",
        handleDoubleClick
      );

      map.off("dragstart", handleDragStart);
      map.off("drag", handleDrag);
      map.off("zoomstart", handleZoomStart);

      window.removeEventListener(
        "be-electric-locate",
        locate
      );

      window.removeEventListener(
        "be-electric-pan-to-station",
        panToStation
      );

      window.removeEventListener(
        "be-electric-map-visible",
        refreshMapSize
      );
    };
  }, [map, onRequestLocation]);

  // Enable following when routing starts.
  useEffect(() => {
    if (!routeMode) {
      followEnabledRef.current = false;

      if (inactivityTimerRef.current !== null) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      return;
    }

    followEnabledRef.current = true;

    const location = userLocationRef.current;
    if (!location) return;

    const targetZoom = 17;
    const screenOffsetY = 100;

    const point = map.project(
      L.latLng(location[0], location[1]),
      targetZoom
    );

    point.y += screenOffsetY;

    const offsetCenter = map.unproject(point, targetZoom);

    isProgrammaticMoveRef.current = true;

    map.flyTo(offsetCenter, targetZoom, {
      animate: true,
      duration: 0.8,
    });

    const timer = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 1000);

    return () => clearTimeout(timer);
  }, [map, routeMode]);

  // Follow fresh GPS updates only when the user hasn't paused following.
  useEffect(() => {
    if (
      !routeMode ||
      !userLocation ||
      !followEnabledRef.current
    ) {
      return;
    }

    const targetZoom = 17;
    const screenOffsetY = 100;

    const point = map.project(
      L.latLng(userLocation[0], userLocation[1]),
      targetZoom
    );

    point.y += screenOffsetY;

    const offsetCenter = map.unproject(point, targetZoom);

    isProgrammaticMoveRef.current = true;

    map.setView(offsetCenter, targetZoom, {
      animate: false,
    });

    const timer = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 150);

    return () => clearTimeout(timer);
  }, [map, routeMode, userLocation]);

  return null;
}

export default function LeafletMap({
  stations,
  selectedId,
  routeMode,
  userLocation,
  isFallbackLocation = false,
  onRequestLocation,
  onSelect,
  onRouteCalculated,
}: Props) {
  const selected = stations.find(
    (station) => station.id === selectedId
  );

  const [roadCoordinates, setRoadCoordinates] = useState<
    [number, number][]
  >([]);

  const onRouteCalculatedRef = useRef(onRouteCalculated);

  useEffect(() => {
    onRouteCalculatedRef.current = onRouteCalculated;
  }, [onRouteCalculated]);

  const selectedLat = selected?.lat;
  const selectedLng = selected?.lng;
  const selectedStationId = selected?.id;

  // Fetch the driving route without fitting the map to the route.
  useEffect(() => {
    if (
      !routeMode ||
      !userLocation ||
      selectedLat == null ||
      selectedLng == null
    ) {
      setRoadCoordinates([]);
      return;
    }

    const controller = new AbortController();
    const routeOrigin = userLocation;

    async function fetchDrivingRoute() {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${routeOrigin[1]},${routeOrigin[0]};${selectedLng},${selectedLat}` +
          `?overview=full&geometries=geojson`;

        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Route request failed: ${response.status}`
          );
        }

        const data = await response.json();

        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];

          const latLngs: [number, number][] =
            route.geometry.coordinates.map(
              ([lng, lat]: [number, number]) =>
                [lat, lng] as [number, number]
            );

          setRoadCoordinates(latLngs);

          onRouteCalculatedRef.current?.({
            distance: `${(
              route.distance / 1000
            ).toFixed(1)} km`,
            minutes: Math.max(
              1,
              Math.round(route.duration / 60)
            ),
          });
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error(
            "Failed to fetch road network route:",
            err
          );
        }
      }
    }

    void fetchDrivingRoute();

    return () => controller.abort();
  }, [
    routeMode,
    selectedStationId,
    selectedLat,
    selectedLng,
    userLocation,
  ]);

  const initialCenter: [number, number] =
    userLocation ??
    (stations.length > 0
      ? [stations[0].lat, stations[0].lng]
      : [25.254483277668196, 51.47912950286491]);

  return (
    <div
      className={`leaflet-map-root ${
        routeMode ? "is-routing" : ""
      }`}
    >
      <MapContainer
        center={initialCenter}
        zoom={userLocation ? 15 : 12}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController
          userLocation={userLocation}
          routeMode={routeMode}
          onRequestLocation={onRequestLocation}
        />

        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 4,
              fillColor: "#91a795",
              fillOpacity: 1,
            }}
          >
            <Popup autoPan={false}>
              <strong>
                {isFallbackLocation
                  ? "Default Starting Location"
                  : "Your GPS Location"}
              </strong>
            </Popup>
          </CircleMarker>
        )}

        {stations.map((station) => {
          const chargers = Array.isArray(station.chargers)
            ? station.chargers
            : [];

          const totalChargers = chargers.length;
          const availableChargers =
            getAvailableChargerCount(station);

          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={stationIcon(
                station,
                selectedId === station.id
              )}
              eventHandlers={{
                click: () => onSelect(station.id),
              }}
            >
              <Popup autoPan={false}>
                <div className="station-popup">
                  <strong>{station.name}</strong>
                  <span>{station.address}</span>

                  <span>
                    {station.power != null
                      ? `${station.power} kW`
                      : "Power not specified"}
                  </span>

                  <span>
                    Total chargers: {totalChargers}
                  </span>

                  <span>
                    Available chargers: {availableChargers}
                  </span>

                  <span>Status: {station.status}</span>

                  <button
                    type="button"
                    onClick={() => onSelect(station.id)}
                  >
                    View station
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {routeMode && roadCoordinates.length > 0 && (
          <>
            <Polyline
              positions={roadCoordinates}
              pathOptions={{
                color: "#ffffff",
                weight: 8,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              }}
            />

            <Polyline
              positions={roadCoordinates}
              pathOptions={{
                color: "#58715d",
                weight: 5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
