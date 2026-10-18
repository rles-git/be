
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 10000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "EV simulator" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Be-Electric simulated charger WebSocket server");
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
});

const chargers = [
  { stationId: "DOH-001", status: "charging", voltage: 230, current: 16 },
  { stationId: "DOH-002", status: "idle", voltage: 230, current: 0 },
  { stationId: "DOH-003", status: "fault", voltage: 0, current: 0 },
];

function getTelemetry(charger) {
  let voltage = charger.voltage;
  let current = charger.current;

  if (charger.status === "charging") {
    voltage = Math.round(225 + Math.random() * 10);
    current = Math.round((10 + Math.random() * 20) * 10) / 10;
  } else if (charger.status === "idle") {
    current = 0;
    voltage = 230;
  } else {
    current = 0;
    voltage = 0;
  }

  return {
    stationId: charger.stationId,
    voltage,
    current,
    powerkW: Math.round((voltage * current) / 1000 * 100) / 100,
    timestamp: new Date().toISOString(),
    status: charger.status,
  };
}

wss.on("connection", (socket, request) => {
  const params = new URL(
    request.url,
    "http://localhost"
  ).searchParams;

  const stationId = params.get("stationId");

  console.log("Client connected:", stationId || "all chargers");

  function sendReadings() {
    if (socket.readyState !== WebSocket.OPEN) return;

    const selected = stationId
      ? chargers.filter((charger) => charger.stationId === stationId)
      : chargers;

    selected.forEach((charger) => {
      socket.send(JSON.stringify(getTelemetry(charger)));
    });
  }

  sendReadings();

  const interval = setInterval(sendReadings, 2000);

  socket.on("message", (raw) => {
    try {
      const command = JSON.parse(raw.toString());

      // Simulator-only controls. Never controls real hardware.
      if (command.type !== "simulateStatus") return;

      const allowedStatuses = ["charging", "idle", "fault"];

      if (!allowedStatuses.includes(command.status)) return;

      const charger = chargers.find(
        (item) => item.stationId === command.stationId
      );

      if (!charger) return;

      charger.status = command.status;
      sendReadings();
    } catch {
      console.error("Invalid simulator command");
    }
  });

  socket.on("close", () => {
    clearInterval(interval);
    console.log("Client disconnected");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Simulator listening on port ${PORT}`);
});
