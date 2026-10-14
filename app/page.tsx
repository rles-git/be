export default function Home() {
  const [selectedId, setSelectedId] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>("Explore");
  const [panel, setPanel] = useState<Panel>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [search, setSearch] = useState("");
  const [fastOnly, setFastOnly] = useState(true);
  const [acOnly, setAcOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetPointerStart = useRef<number | null>(null);

  const [calculatedRoute, setCalculatedRoute] = useState<{
    distance: string;
    minutes: number;
  } | null>(null);

  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);

  function handleSheetPointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    sheetPointerStart.current = event.clientY;
    setSheetDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!sheetDragging || sheetPointerStart.current === null) return;

    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(0, Math.min(520, delta)));
  }

  function handleSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;

    setSheetDragY((current) => (current > 120 ? 340 : 0));
  }

  function handleRouteSheetPointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!sheetDragging || sheetPointerStart.current === null) return;

    const delta = event.clientY - sheetPointerStart.current;
    setSheetDragY(Math.max(0, Math.min(105, delta)));
  }

  function handleRouteSheetPointerUp() {
    setSheetDragging(false);
    sheetPointerStart.current = null;

    setSheetDragY((current) => (current > 55 ? 65 : 0));
  }

  const selected = stations.find((s) => s.id === selectedId) ?? stations[0];

  const activeMinutes = calculatedRoute?.minutes ?? selected.minutes;
  const activeDistance = calculatedRoute?.distance ?? selected.distance;

  const filtered = useMemo(
    () =>
      stations.filter(
        (s) =>
          (!fastOnly || s.kind === "DC fast") &&
          (!acOnly || s.kind === "AC") &&
          (!availableOnly || s.available >= 2) &&
          `${s.name} ${s.address} ${s.id}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [search, fastOnly, acOnly, availableOnly]
  );

  const nearbyStations = useMemo(
    () =>
      filtered.filter((s) => {
        const distance = getDistanceKm(
          START_LOCATION[0],
          START_LOCATION[1],
          s.lat,
          s.lng
        );

        return distance >= 0 && distance <= 5;
      }),
    [filtered]
  );

  const savedStations = stations.filter((s) => saved.includes(s.id));

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  }

  function openRoute() {
    setSheetDragY(0);
    setPanel("chooser");
    setRouteMode(false);
  }

  function externalMap(app: string) {
    const destination = encodeURIComponent(
      `${selected.name}, ${selected.address}`
    );

    const urls: Record<string, string> = {
      "Google Maps": `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      "Apple Maps": `https://maps.apple.com/?daddr=${destination}`,
      Waze: `https://waze.com/ul?q=${destination}&navigate=yes`,
    };

    if (urls[app]) {
      window.open(urls[app], "_blank", "noopener,noreferrer");
    } else {
      setPanel("route");
      setRouteMode(true);
    }
  }

  function handleConfirmArrival() {
    const newRoute: RecentRoute = {
      id: `${Date.now()}-${selected.id}`,
      stationId: selected.id,
      stationName: selected.name,
      address: selected.address,
      distance: activeDistance,
      minutes: activeMinutes,
      completedAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setRecentRoutes((prev) => [newRoute, ...prev]);
    setRouteMode(false);
    setPanel(null);
    setSheetDragY(0);
    setCalculatedRoute(null);

    notify(`Arrived at ${selected.shortName}! Saved to Activity.`);
  }

  return (
    <main className="desktop-shell">
