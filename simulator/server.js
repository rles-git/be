
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

// In-memory simulated charger state.
// These are test values, not readings from real hardware.
const chargers = [
  {
    stationId: "1",
    status: "charging",
    connected: true,
    voltage: 400,
    powerkW: 117,
    overheatingFault: false,
  },
  {
    stationId: "DOH-001",
    status: "charging",
    connected: true,
    voltage: 230,
    powerkW: 3.68,
    overheatingFault: false,
  },
  {
    stationId: "DOH-002",
    status: "idle",
    connected: true,
    voltage: 230,
    powerkW: 0,
    overheatingFault: false,
  },
  {
    stationId: "DOH-003",
    status: "fault",
    connected: true,
    voltage: 0,
    powerkW: 0,
    overheatingFault: false,
  },
];

const allowedStatuses = [
  "charging",
  "idle",
  "fault",
  "preparing",
  "suspended",
  "finishing",
];

function getTelemetry(charger) {
  const online = charger.connected;
  const faulted =
    charger.status === "fault" || charger.overheatingFault;

  let voltage = 0;
  let current = 0;
  let powerkW = 0;

  if (online && !faulted && charger.status === "charging") {
    // Use a three-phase, 400 V example for the 117 kW charger.
    // P = sqrt(3) * V * I * power factor.
    voltage = charger.voltage;

    const powerFactor = 1;
    const baseCurrent =
      (charger.powerkW * 1000) /
      (Math.sqrt(3) * voltage * powerFactor);

    // Small variation for other chargers; keep BEQ-DOH-021 stable
    // at the requested target power.
    if (charger.stationId === "1") {
      current = Math.round(baseCurrent * 10) / 10;
      powerkW =
        Math.round(
          (Math.sqrt(3) * voltage * current * powerFactor) / 10
        ) / 100;
    } else {
      current = Math.round(baseCurrent * (0.95 + Math.random() * 0.1) * 10) / 10;
      powerkW =
        Math.round(
          (Math.sqrt(3) * voltage * current * powerFactor) / 10
        ) / 100;
    }
  } else if (
    online &&
    !faulted &&
    ["idle", "preparing", "suspended", "finishing"].includes(
      charger.status
    )
  ) {
    voltage = charger.voltage || 230;
    current = 0;
    powerkW = 0;
  }

  return {
    stationId: charger.stationId,
    chargerId: charger.stationId,
    connected: online,
    connection: online ? "Connected" : "Disconnected",
    voltage,
    current,
    powerkW,
    timestamp: new Date().toISOString(),
    status: online ? (faulted ? "fault" : charger.status) : "offline",
    overheatingFault: charger.overheatingFault,
  };
}

function sendTelemetry(socket, stationId) {
  if (socket.readyState !== WebSocket.OPEN) return;

  const selected = stationId
    ? chargers.filter((charger) => charger.stationId === stationId)
    : chargers;

  selected.forEach((charger) => {
    socket.send(JSON.stringify(getTelemetry(charger)));
  });
}

function broadcastTelemetry(stationId) {
  for (const socket of wss.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;

    const selectedId = socket.stationId;

    if (
      !selectedId ||
      selectedId === stationId
    ) {
      sendTelemetry(socket, selectedId);
    }
  }
}

function handleCommand(command, socket) {
  // New simulator controls.
  if (
    command.type === "SIMULATOR_CONTROL" ||
    command.type === "simulateControl"
  ) {
    const chargerId = command.chargerId || command.stationId;

    const charger = chargers.find(
      (item) => item.stationId === chargerId
    );

    if (!charger) {
      socket.send(
        JSON.stringify({
          type: "commandResult",
          ok: false,
          error: `Unknown charger: ${chargerId}`,
        })
      );
      return;
    }

    const requestedConnection = command.connection;

    if (
      requestedConnection !== undefined &&
      !["Connected", "Disconnected"].includes(requestedConnection)
    ) {
      socket.send(JSON.stringify({
        type: "commandResult",
        ok: false,
        error: "Invalid connection value",
      }));
      return;
    }

    if (command.status !== undefined) {
      if (!allowedStatuses.includes(command.status.toLowerCase())) {
        socket.send(JSON.stringify({
          type: "commandResult",
          ok: false,
          error: "Invalid charger status",
        }));
        return;
      }
      charger.status = command.status.toLowerCase();
    }

    if (command.powerKW !== undefined) {
      const power = Number(command.powerKW);

      if (!Number.isFinite(power) || power < 0 || power > 150) {
        socket.send(JSON.stringify({
          type: "commandResult",
          ok: false,
          error: "Power must be between 0 and 150 kW",
        }));
        return;
      }

      charger.powerkW = power;
    }

    if (command.overheatingFault !== undefined) {
      if (typeof command.overheatingFault !== "boolean") {
        socket.send(JSON.stringify({
          type: "commandResult",
          ok: false,
          error: "overheatingFault must be true or false",
        }));
        return;
      }

      charger.overheatingFault = command.overheatingFault;

      // Simulate a fault transition and recovery.
      if (charger.overheatingFault) {
        charger.status = "fault";
      } else if (charger.status === "fault") {
        charger.status = "idle";
      }
    }

    if (requestedConnection !== undefined) {
      charger.connected = requestedConnection === "Connected";
    }

    socket.send(JSON.stringify({
      type: "commandResult",
      ok: true,
      chargerId: charger.stationId,
      message: "Simulator settings applied",
      state: getTelemetry(charger),
    }));

    broadcastTelemetry(charger.stationId);
    return;
  }

  // Backward compatibility with the original status control.
  if (command.type === "simulateStatus") {
    const charger = chargers.find(
      (item) => item.stationId === command.stationId
    );

    if (!charger || !allowedStatuses.includes(command.status)) return;

    charger.status = command.status;
    broadcastTelemetry(charger.stationId);
  }
}

wss.on("connection", (socket, request) => {
  const params = new URL(
    request.url,
    "http://localhost"
  ).searchParams;

  const stationId = params.get("stationId");

  // Used to target immediate updates to the right dashboard.
  socket.stationId = stationId;

  console.log("Dashboard connected:", stationId || "all chargers");

  sendTelemetry(socket, stationId);

  const interval = setInterval(() => {
    sendTelemetry(socket, stationId);
  }, 2000);

  socket.on("message", (raw) => {
    try {
      const command = JSON.parse(raw.toString());
      handleCommand(command, socket);
    } catch (error) {
      console.error("Invalid simulator command:", error.message);
    }
  });

  socket.on("close", () => {
    clearInterval(interval);
    console.log("Dashboard disconnected:", stationId || "all chargers");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Simulator listening on port ${PORT}`);
});
