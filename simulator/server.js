
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 10000);

const DATA_MODE = (
  process.env.CHARGER_DATA_MODE || "mock"
).toLowerCase();

const LIVE_CHARGER_IDS = new Set(
  (process.env.LIVE_CHARGER_IDS || "")
    .split(",")
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean)
);

const LIVE_INGEST_TOKEN = process.env.LIVE_INGEST_TOKEN || "";

const LIVE_STALE_AFTER_MS = Number(
  process.env.LIVE_STALE_AFTER_MS || 15000
);

const VALID_MODES = ["mock", "live", "hybrid"];

if (!VALID_MODES.includes(DATA_MODE)) {
  throw new Error(
    "CHARGER_DATA_MODE must be mock, live, or hybrid"
  );
}

if (
  !Number.isFinite(LIVE_STALE_AFTER_MS) ||
  LIVE_STALE_AFTER_MS < 1000
) {
  throw new Error("LIVE_STALE_AFTER_MS must be at least 1000");
}

// Canonical charger IDs. Keep these aligned with Neon.
const chargerIds = Array.from(
  { length: 30 },
  (_, index) => `Q${String(index + 1).padStart(3, "0")}`
);

const allowedStatuses = [
  "charging",
  "idle",
  "fault",
  "preparing",
  "suspended",
  "finishing",
];

// These are mock values, not real charger readings.
// Keep these separate from live telemetry.
const mockChargers = new Map(
  chargerIds.map((stationId, index) => {
    let charger = {
      stationId,
      status: "idle",
      connected: true,
      voltage: 230,
      powerkW: 0,
      overheatingFault: false,
    };

    if (index === 0) {
      charger = {
        ...charger,
        status: "charging",
        voltage: 400,
        powerkW: 117,
      };
    } else if (index === 1) {
      charger = {
        ...charger,
        status: "charging",
        voltage: 230,
        powerkW: 3.68,
      };
    } else if (index === 3) {
      charger = {
        ...charger,
        status: "fault",
        voltage: 0,
        powerkW: 0,
      };
    }

    return [stationId, charger];
  })
);

// Most recent live reading for each charger.
// Data expires after LIVE_STALE_AFTER_MS.
const liveTelemetry = new Map();

function isLiveCharger(stationId) {
  if (DATA_MODE === "live") return true;
  if (DATA_MODE === "mock") return false;

  return LIVE_CHARGER_IDS.has(stationId);
}

function getDataSource(stationId) {
  return isLiveCharger(stationId) ? "live" : "mock";
}

function getMockTelemetry(charger) {
  const faulted =
    charger.status === "fault" || charger.overheatingFault;

  let voltage = 0;
  let current = 0;
  let powerkW = 0;

  if (
    charger.connected &&
    !faulted &&
    charger.status === "charging" &&
    charger.voltage > 0
  ) {
    voltage = charger.voltage;

    // Three-phase 400 V example for Q001.
    if (charger.stationId === "Q001") {
      current =
        (charger.powerkW * 1000) /
        (Math.sqrt(3) * voltage);

      current = Math.round(current * 10) / 10;

      powerkW =
        Math.round(
          (Math.sqrt(3) * voltage * current) / 10
        ) / 100;
    } else {
      const baseCurrent =
        (charger.powerkW * 1000) /
        (Math.sqrt(3) * voltage);

      current = Math.round(
        baseCurrent * (0.95 + Math.random() * 0.1) * 10
      ) / 10;

      powerkW =
        Math.round(
          (Math.sqrt(3) * voltage * current) / 10
        ) / 100;
    }
  } else if (
    charger.connected &&
    !faulted &&
    allowedStatuses.includes(charger.status)
  ) {
    voltage = charger.voltage || 230;
  }

  const online = charger.connected;

  return {
    stationId: charger.stationId,
    chargerId: charger.stationId,
    connected: online,
    connection: online ? "Connected" : "Disconnected",
    voltage,
    current,
    powerkW,
    timestamp: new Date().toISOString(),
    status: online
      ? faulted
        ? "fault"
        : charger.status
      : "offline",
    overheatingFault: charger.overheatingFault,
    dataSource: "mock",
    stale: false,
  };
}

function getLiveTelemetry(stationId) {
  const reading = liveTelemetry.get(stationId);

  if (!reading) {
    return {
      stationId,
      chargerId: stationId,
      connected: false,
      connection: "Disconnected",
      voltage: null,
      current: null,
      powerkW: null,
      timestamp: null,
      status: "offline",
      overheatingFault: null,
      dataSource: "live",
      stale: true,
    };
  }

  const stale =
    Date.now() - reading.receivedAt > LIVE_STALE_AFTER_MS;

  if (stale) {
    return {
      ...reading.telemetry,
      connected: false,
      connection: "Disconnected",
      status: "offline",
      dataSource: "live",
      stale: true,
    };
  }

  return {
    ...reading.telemetry,
    dataSource: "live",
    stale: false,
  };
}

function getTelemetry(stationId) {
  if (isLiveCharger(stationId)) {
    return getLiveTelemetry(stationId);
  }

  const charger = mockChargers.get(stationId);

  return charger ? getMockTelemetry(charger) : null;
}

function sendTelemetry(socket, stationId) {
  if (socket.readyState !== WebSocket.OPEN) return;

  const selected = stationId
    ? [stationId]
    : chargerIds;

  for (const id of selected) {
    const telemetry = getTelemetry(id);
    if (telemetry) {
      socket.send(JSON.stringify(telemetry));
    }
  }
}

function broadcastTelemetry(stationId) {
  for (const socket of wss.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;

    if (!socket.stationId || socket.stationId === stationId) {
      sendTelemetry(socket, stationId);
    }
  }
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 16384) {
        tooLarge = true;
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (tooLarge) return;

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

// Accept normalized readings from an authorized live adapter.
// POST /api/telemetry
//
// Authorization: Bearer <LIVE_INGEST_TOKEN>
//
// Example JSON:
// {
//   "stationId": "Q001",
//   "connected": true,
//   "status": "charging",
//   "voltage": 400,
//   "current": 169,
//   "powerkW": 117,
//   "overheatingFault": false
// }
function normalizeLiveTelemetry(input) {
  const stationId = String(
    input.stationId || input.chargerId || ""
  ).trim().toUpperCase();

  if (!chargerIds.includes(stationId)) {
    throw new Error("Unknown charger ID");
  }

  if (
    typeof input.connected !== "boolean" ||
    typeof input.overheatingFault !== "boolean"
  ) {
    throw new Error(
      "connected and overheatingFault must be booleans"
    );
  }

  const status = String(input.status || "").toLowerCase();

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid charger status");
  }

  const voltage = Number(input.voltage);
  const current = Number(input.current);
  const powerkW = Number(
    input.powerkW ?? input.powerKW
  );

  for (const [name, value] of Object.entries({
    voltage,
    current,
    powerkW,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative number`);
    }
  }

  if (voltage > 1000 || current > 1000 || powerkW > 500) {
    throw new Error("Telemetry value exceeds safety limits");
  }

  const faulted =
    status === "fault" || input.overheatingFault;

  const connected = input.connected;

  return {
    stationId,
    chargerId: stationId,
    connected,
    connection: connected ? "Connected" : "Disconnected",
    voltage,
    current,
    powerkW,
    timestamp: new Date().toISOString(),
    status: !connected
      ? "offline"
      : faulted
        ? "fault"
        : status,
    overheatingFault: input.overheatingFault,
    dataSource: "live",
    stale: false,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  if (req.method === "GET" && url.pathname === "/health") {
    return jsonResponse(res, 200, {
      status: "ok",
      service: "Be-Electric charger telemetry",
      mode: DATA_MODE,
    });
  }

  if (
    req.method === "GET" &&
    url.pathname === "/api/chargers"
  ) {
    return jsonResponse(res, 200, {
      mode: DATA_MODE,
      chargers: chargerIds.map((stationId) => ({
        stationId,
        dataSource: getDataSource(stationId),
      })),
    });
  }

  if (
    req.method === "POST" &&
    url.pathname === "/api/telemetry"
  ) {
    if (!LIVE_INGEST_TOKEN) {
      return jsonResponse(res, 503, {
        error: "Live telemetry ingestion is not configured",
      });
    }

    const authorization = req.headers.authorization || "";
    const expected = `Bearer ${LIVE_INGEST_TOKEN}`;

    if (authorization !== expected) {
      return jsonResponse(res, 401, {
        error: "Unauthorized",
      });
    }

    try {
      const input = await readJsonBody(req);
      const telemetry = normalizeLiveTelemetry(input);

      liveTelemetry.set(telemetry.stationId, {
        telemetry,
        receivedAt: Date.now(),
      });

      broadcastTelemetry(telemetry.stationId);

      return jsonResponse(res, 200, {
        ok: true,
        stationId: telemetry.stationId,
        accepted: true,
      });
    } catch (error) {
      return jsonResponse(res, 400, {
        error: error.message || "Invalid telemetry",
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });

    return res.end(
      "Be-Electric charger telemetry WebSocket server"
    );
  }

  jsonResponse(res, 404, { error: "Not found" });
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
});

function handleCommand(command, socket) {
  if (
    command.type !== "SIMULATOR_CONTROL" &&
    command.type !== "simulateControl" &&
    command.type !== "simulateStatus"
  ) {
    return;
  }

  const stationId = String(
    command.chargerId || command.stationId || ""
  ).trim().toUpperCase();

  const charger = mockChargers.get(stationId);

  if (!charger) {
    socket.send(JSON.stringify({
      type: "commandResult",
      ok: false,
      error: `Unknown charger: ${stationId}`,
    }));
    return;
  }

  // Never allow mock commands to control live-designated chargers.
  if (isLiveCharger(stationId)) {
    socket.send(JSON.stringify({
      type: "commandResult",
      ok: false,
      error: "Simulator controls are disabled for live chargers",
    }));
    return;
  }

  const isLegacy = command.type === "simulateStatus";

  if (command.status !== undefined) {
    if (
      typeof command.status !== "string" ||
      !allowedStatuses.includes(command.status.toLowerCase())
    ) {
      socket.send(JSON.stringify({
        type: "commandResult",
        ok: false,
        error: "Invalid charger status",
      }));
      return;
    }

    charger.status = command.status.toLowerCase();
  }

  if (!isLegacy && command.powerKW !== undefined) {
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

  if (!isLegacy && command.connection !== undefined) {
    if (!["Connected", "Disconnected"].includes(command.connection)) {
      socket.send(JSON.stringify({
        type: "commandResult",
        ok: false,
        error: "Invalid connection value",
      }));
      return;
    }

    charger.connected = command.connection === "Connected";
  }

  if (!isLegacy && command.overheatingFault !== undefined) {
    if (typeof command.overheatingFault !== "boolean") {
      socket.send(JSON.stringify({
        type: "commandResult",
        ok: false,
        error: "overheatingFault must be true or false",
      }));
      return;
    }

    charger.overheatingFault = command.overheatingFault;

    if (charger.overheatingFault) {
      charger.status = "fault";
    } else if (charger.status === "fault") {
      charger.status = "idle";
    }
  }

  socket.send(JSON.stringify({
    type: "commandResult",
    ok: true,
    chargerId: stationId,
    message: "Mock simulator settings applied",
    state: getMockTelemetry(charger),
  }));

  broadcastTelemetry(stationId);
}

wss.on("connection", (socket, request) => {
  const params = new URL(
    request.url,
    "http://localhost"
  ).searchParams;

  const requestedId = params.get("stationId");
  const stationId = requestedId
    ? requestedId.trim().toUpperCase()
    : null;

  if (stationId && !chargerIds.includes(stationId)) {
    socket.close(1008, "Unknown charger ID");
    return;
  }

  socket.stationId = stationId;

  console.log(
    "Dashboard connected:",
    stationId || "all chargers"
  );

  sendTelemetry(socket, stationId);

  const interval = setInterval(() => {
    sendTelemetry(socket, stationId);
  }, 2000);

  socket.on("message", (raw) => {
    try {
      const command = JSON.parse(raw.toString());
      handleCommand(command, socket);
    } catch (error) {
      console.error(
        "Invalid simulator command:",
        error.message
      );
    }
  });

  socket.on("close", () => {
    clearInterval(interval);

    console.log(
      "Dashboard disconnected:",
      stationId || "all chargers"
    );
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Data mode: ${DATA_MODE}`);
  console.log(`WebSocket endpoint: /ws`);
  console.log(`Live charger IDs: ${
    [...LIVE_CHARGER_IDS].join(", ") || "(none configured)"
  }`);
});
