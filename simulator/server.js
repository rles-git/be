// Be-Electric EV Charger Simulator
// Install: npm install ws @neondatabase/serverless
// Environment variables: DATABASE_URL, PORT, LIVE_INGEST_TOKEN
// This is a simulator. It does not connect to a physical charger.

const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const { neon } = require("@neondatabase/serverless");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL || "";
const LIVE_INGEST_TOKEN = process.env.LIVE_INGEST_TOKEN || "";
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

const chargers = new Map();
const activeSessions = new Map();
const events = [];
let wss;

const STATUSES = [
  "idle",
  "charging",
  "fault",
  "preparing",
  "suspended",
  "finishing",
];

function log(type, chargerId, message, details = {}) {
  events.unshift({
    time: new Date().toISOString(),
    type,
    chargerId,
    message,
    details,
  });

  if (events.length > 150) events.length = 150;
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function round(value, decimals = 3) {
  return Number(Number(value).toFixed(decimals));
}

function requireDatabase() {
  if (!sql) {
    throw new Error("DATABASE_URL is not configured.");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 20000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });

    req.on("error", reject);
  });
}

function telemetry(c) {
  const fault =
    !c.connected ||
    c.status === "fault" ||
    c.overheatingFault;

  const power =
    c.connected && !fault && c.status === "charging"
      ? c.powerKW
      : 0;

  const voltage =
    c.connected && !fault ? c.voltage : 0;

  // Three-phase approximation. Actual chargers can use
  // different electrical configurations and power factors.
  const current =
    power > 0 && voltage > 0
      ? (power * 1000) / (Math.sqrt(3) * voltage)
      : 0;

  return {
    chargerId: c.id,
    stationId: c.stationId,
    connected: c.connected,
    status: !c.connected
      ? "offline"
      : fault
        ? "fault"
        : c.status,
    powerkW: round(power),
    voltage: round(voltage, 2),
    current: round(current, 2),
    temperatureC: round(c.temperatureC, 2),
    overheatingFault: c.overheatingFault,
    dataSource: "mock",
    timestamp: new Date().toISOString(),
    heartbeatAt: c.connected
      ? new Date().toISOString()
      : null,
  };
}

function broadcast(chargerId) {
  if (!wss) return;

  const c = chargers.get(chargerId);
  if (!c) return;

  const message = JSON.stringify({
    type: "telemetry",
    ...telemetry(c),
  });

  for (const client of wss.clients) {
    if (
      client.readyState === WebSocket.OPEN &&
      (!client.chargerId || client.chargerId === chargerId)
    ) {
      client.send(message);
    }
  }
}

function broadcastHandshakeResult(result) {
  if (!wss) return;

  const message = JSON.stringify({
    type: "handshake_result",
    ...result,
  });

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    // Only notify clients watching this charger.
    if (
      client.chargerId &&
      String(client.chargerId) !== String(result.chargerId)
    ) {
      continue;
    }

    // If a client specified a connector, match that too.
    if (
      client.connectorId &&
      String(client.connectorId) !== String(result.connectorId)
    ) {
      continue;
    }

    client.send(message);
  }
}

async function loadChargers() {
  requireDatabase();

  const rows = await sql`
    SELECT
      c.id,
      c.station_id,
      c.name,
      c.manufacturer,
      c.model,
      c.max_power_kw,
      c.status AS charger_status,
      c.protocol,
      c.protocol_identity,
      co.id AS connector_id,
      co.connector_number,
      co.connector_type,
      co.max_power_kw AS connector_max_power_kw,
      co.status AS connector_status
    FROM public.chargers c
    LEFT JOIN public.connectors co
      ON co.charger_id = c.id
    ORDER BY c.id, co.connector_number
  `;

  const grouped = new Map();

  for (const row of rows) {
    let c = grouped.get(row.id);

    if (!c) {
      c = {
        id: row.id,
        stationId: row.station_id,
        name: row.name || row.id,
        manufacturer: row.manufacturer || "",
        model: row.model || "",
        maxPowerKW: Number(row.max_power_kw) || 150,
        dbStatus: row.charger_status || "unknown",
        protocol: row.protocol || "OCPP 1.6J",
        protocolIdentity: row.protocol_identity || row.id,
        connectors: [],
      };

      grouped.set(row.id, c);
    }

    if (row.connector_id) {
      c.connectors.push({
        id: row.connector_id,
        number: Number(row.connector_number),
        type: row.connector_type,
        maxPowerKW:
          Number(row.connector_max_power_kw) ||
          c.maxPowerKW,
        dbStatus: row.connector_status || "unknown",
      });
    }
  }

  for (const c of grouped.values()) {
    if (!chargers.has(c.id)) {
      chargers.set(c.id, {
        ...c,
        status:
          c.dbStatus === "charging"
            ? "charging"
            : c.dbStatus === "fault"
              ? "fault"
              : "idle",
        connected: c.dbStatus !== "offline",
        powerKW: 50,
        voltage: 400,
        temperatureC: 28,
        overheatingFault: false,
      });
    } else {
      const existing = chargers.get(c.id);

      Object.assign(existing, c);
    }
  }

  for (const id of chargers.keys()) {
    if (!grouped.has(id)) chargers.delete(id);
  }

  return [...chargers.values()].map((c) => ({
    ...c,
    telemetry: telemetry(c),
  }));
}

async function saveTelemetry(c) {
  requireDatabase();

  const t = telemetry(c);

  await sql`
    INSERT INTO public.charger_telemetry (
      charger_id,
      recorded_at,
      source,
      power_kw,
      temperature_c,
      voltage_v,
      current_a,
      heartbeat_at,
      raw_payload
    )
    VALUES (
      ${c.id},
      NOW(),
      'mock',
      ${t.powerkW},
      ${t.temperatureC},
      ${t.voltage},
      ${t.current},
      ${t.heartbeatAt},
      ${JSON.stringify(t)}::jsonb
    )
  `;
}

async function updateStatuses(c) {
  requireDatabase();

  const chargerStatus = !c.connected
    ? "offline"
    : c.overheatingFault || c.status === "fault"
      ? "fault"
      : c.status === "charging"
        ? "charging"
        : "available";

  await sql`
    UPDATE public.chargers
    SET status = ${chargerStatus},
        updated_at = NOW()
    WHERE id = ${c.id}
  `;

  for (const co of c.connectors) {
    const connectorStatus = !c.connected
      ? "unavailable"
      : chargerStatus === "fault"
        ? "faulted"
        : c.status === "charging"
          ? "charging"
          : c.status === "preparing"
            ? "preparing"
            : c.status === "finishing"
              ? "finishing"
              : "available";

    await sql`
      UPDATE public.connectors
      SET status = ${connectorStatus},
          updated_at = NOW()
      WHERE id = ${co.id}
    `;
  }
}

async function applyControls(input) {
  const c = chargers.get(String(input.chargerId || ""));

  if (!c) throw new Error("Unknown charger.");

  const connector = c.connectors.find(
    (co) => co.id === input.connectorId
  );

  const maxPower = Math.min(
    Number(c.maxPowerKW) || 150,
    connector
      ? Number(connector.maxPowerKW) || 150
      : Number(c.maxPowerKW) || 150
  );

  const power = Number(input.powerKW);
  const voltage = Number(input.voltage);
  const temperature = Number(input.temperatureC);

  if (!Number.isFinite(power) || power < 0 || power > maxPower) {
    throw new Error(`Power must be between 0 and ${maxPower} kW.`);
  }

  if (!Number.isFinite(voltage) || voltage < 0 || voltage > 1000) {
    throw new Error("Voltage must be between 0 and 1000 V.");
  }

  if (
    !Number.isFinite(temperature) ||
    temperature < -20 ||
    temperature > 150
  ) {
    throw new Error("Temperature must be between -20 and 150 °C.");
  }

if (!STATUSES.includes(input.status)) {
  throw new Error("Invalid charger status.");
}

  Object.assign(c, {
    powerKW: power,
    voltage,
    temperatureC: temperature,
    connected: Boolean(input.connected),
    overheatingFault: Boolean(input.overheatingFault),
    status: input.overheatingFault ? "fault" : input.status,
  });

  await updateStatuses(c);
  await saveTelemetry(c);

  broadcast(c.id);

  log("control", c.id, "Simulator controls applied", {
    powerKW: power,
    voltage,
    temperatureC: temperature,
    status: c.status,
  });

  return telemetry(c);
}


async function handshake(input) {
  const c = chargers.get(String(input.chargerId || ""));

  if (!c) {
    throw new Error("Unknown charger.");
  }

  const co = c.connectors.find(
    (x) => x.id === input.connectorId
  ) || c.connectors[0];

  if (!co) {
    throw new Error("This charger has no database connector.");
  }

  if (c.overheatingFault || c.status === "fault") {
    throw new Error("Handshake failed: clear the charger fault before connecting.");
  }

  if (!c.connected) {
    throw new Error("Handshake failed: the charger is offline. Enable Network connected and retry.");
  }

  // Simulate a real handshake taking time.
  const sequence = [
    {
      type: "BootNotification",
      message: "Charger identified itself to the central system.",
    },
    {
      type: "Heartbeat",
      message: "Heartbeat received.",
    },
    {
      type: "StatusNotification",
      message: "Connector status reported.",
    },
    {
      type: "Authorize",
      message: "Mock authorization accepted.",
    },
  ];

  const completedEvents = [];

  for (const step of sequence) {
    // Simulate waiting for each mock handshake step.
    await new Promise((resolve) => setTimeout(resolve, 700));

    const event = {
      type: step.type,
      message: step.message,
    };

    completedEvents.push(event);

    log(step.type, c.id, step.message, {
      connectorId: co.id,
      protocol: c.protocol,
      protocolIdentity: c.protocolIdentity,
      mock: true,
    });
  }

  // Mark connected only after every step succeeds.
  c.connected = true;

  if (c.status === "fault") {
    c.status = "idle";
  }

  await updateStatuses(c);
  await saveTelemetry(c);
  broadcast(c.id);

  log("handshake-success", c.id, "Mock handshake completed successfully.", {
    connectorId: co.id,
    protocol: c.protocol,
    mock: true,
  });

  return {
    ok: true,
    status: "connected",
    message: "Mock handshake completed successfully. Cable connection confirmed.",
    chargerId: c.id,
    connectorId: co.id,
    protocol: c.protocol,
    protocolIdentity: c.protocolIdentity,
    events: completedEvents,
    telemetry: telemetry(c),
  };
}


async function startSession(input) {
  requireDatabase();

  const c = chargers.get(String(input.chargerId || ""));

  if (!c) throw new Error("Unknown charger.");

  const co = c.connectors.find(
    (x) => x.id === input.connectorId
  );

  if (!co) throw new Error("Invalid connector for this charger.");

  if (!c.connected || c.status === "fault" || c.overheatingFault) {
    throw new Error("Charger is disconnected or faulted.");
  }

  if (activeSessions.has(co.id)) {
    throw new Error("This connector already has an active simulator session.");
  }

  const target = Number(input.targetEnergyKWh);

  if (!Number.isFinite(target) || target <= 0 || target > 1000) {
    throw new Error("Target energy must be between 0 and 1000 kWh.");
  }

  const externalId = String(
    input.externalSessionId || `MOCK-${Date.now()}`
  ).slice(0, 100);

  const rows = await sql`
    INSERT INTO public.charging_sessions (
      connector_id,
      external_session_id,
      status,
      started_at,
      energy_kwh
    )
    VALUES (
      ${co.id},
      ${externalId},
      'active',
      NOW(),
      0
    )
    RETURNING *
  `;

  const session = rows[0];

  activeSessions.set(co.id, {
    id: session.id,
    connectorId: co.id,
    chargerId: c.id,
    target,
    energy: 0,
    lastMs: Date.now(),
  });

  c.status = "charging";

  await updateStatuses(c);
  await saveTelemetry(c);

  broadcast(c.id);

  log("session", c.id, "Charging session started", {
    sessionId: session.id,
    connectorId: co.id,
    targetEnergyKWh: target,
  });

  return session;
}

async function stopSession(input) {
  requireDatabase();

  const entry = [...activeSessions.entries()].find(
    ([, session]) => String(session.id) === String(input.sessionId)
  );

  if (!entry) {
    throw new Error("No active simulator session with that ID.");
  }

  const [connectorId, session] = entry;
  const c = chargers.get(session.chargerId);

  const energy = round(session.energy);

  const rows = await sql`
    UPDATE public.charging_sessions
    SET status = 'completed',
        ended_at = NOW(),
        energy_kwh = ${energy}
    WHERE id = ${session.id}
      AND status = 'active'
    RETURNING *
  `;

  if (!rows.length) {
    throw new Error("Session could not be completed in the database.");
  }

  activeSessions.delete(connectorId);

  if (c) {
    c.status = "idle";

    await updateStatuses(c);
    await saveTelemetry(c);

    broadcast(c.id);
  }

  log("session", session.chargerId, "Charging session completed", {
    sessionId: session.id,
    energyKWh: energy,
  });

  return rows[0];
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Be-Electric Charger Simulator</title>
<style>
:root {
  color-scheme: dark;
  --bg:#07121a; --panel:#0c1c27; --line:#203b4b;
  --text:#e7f2f7; --muted:#9ab4c5; --green:#43d6a0;
  --red:#ff7183; --amber:#ffcb70;
}
* { box-sizing:border-box }
body {
  margin:0; background:var(--bg); color:var(--text);
  font:14px/1.5 system-ui,Arial,sans-serif;
}
header {
  display:flex; justify-content:space-between; align-items:center;
  flex-wrap:wrap; gap:12px; padding:20px;
  border-bottom:1px solid var(--line);
}
h1 { margin:0; font-size:24px }
h2 { margin:0 0 12px; font-size:17px }
p { color:var(--muted) }
.layout {
  display:grid;
  grid-template-columns:minmax(280px,380px) minmax(300px,1fr) minmax(230px,290px);
  gap:14px; padding:14px; align-items:start;
}
.panel {
  background:var(--panel); border:1px solid var(--line);
  border-radius:12px; padding:16px; margin-bottom:14px;
  min-width:0;
}
label { display:block; color:var(--muted); margin:12px 0 6px }
input,select,button {
  font:inherit; color:var(--text); background:#091720;
  border:1px solid #315064; border-radius:7px; padding:10px;
}
input[type=number],input[type=text],select { width:100% }
input[type=range] { width:100%; accent-color:var(--green) }
input[type=checkbox] { width:18px; height:18px; accent-color:var(--green) }
button { cursor:pointer }
button:hover { border-color:var(--green) }
.primary { background:var(--green); color:#05251c; font-weight:bold }
.danger { color:var(--red) }
.actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px }
.actions button { flex:1 }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px }
.metric { background:#091720; border:1px solid var(--line); border-radius:9px; padding:12px; overflow-wrap:anywhere }
.metric small { color:var(--muted) }
.metric strong { display:block; font-size:23px; margin:8px 0 }
.muted { color:var(--muted); font-size:12px }
.green { color:var(--green) }
.red { color:var(--red) }
.event,.session { border-bottom:1px solid var(--line); padding:10px 0; font-size:12px; overflow-wrap:anywhere }
.charger { display:block; width:100%; text-align:left; margin:6px 0 }
.notice { color:var(--amber); font-size:12px; margin-top:12px }
#toast {
  display:none; position:fixed; bottom:16px; left:50%;
  transform:translateX(-50%); padding:12px;
  background:#17372f; border:1px solid var(--green);
  border-radius:8px; max-width:90%; z-index:10;
}
@media(max-width:1050px) {
  .layout { grid-template-columns:1fr 1fr }
  .right { grid-column:1/-1 }
}
@media(max-width:650px) {
  .layout { grid-template-columns:1fr }
  .right { grid-column:auto }
}
</style>
</head>
<body>
<header>
  <div>
    <h1><span class="green">ϟ</span> be-electric</h1>
    <div class="muted">EV charger simulator · Mock telemetry lab</div>
  </div>
  <div>
    <span>Mode: <b class="green">MOCK</b></span>
    <p>WebSocket: <b id="wsState">Connecting...</b></p>
    <button id="refresh">Refresh database</button>
  </div>
</header>

<main class="layout">
<section class="panel">
  <h2>Charger controls</h2>
  <label for="charger">Charger</label>
  <select id="charger"></select>
  <p id="chargerInfo" class="muted"></p>

  <label for="connector">Connector</label>
  <select id="connector"></select>

  <label for="power">Power (kW): <b id="powerLabel">50</b></label>
  <input id="power" type="range" min="0" max="150" step=".5" value="50">
  <input id="powerNumber" type="number" min="0" max="500" step=".5" value="50">

  <label for="voltage">Voltage (V): <b id="voltageLabel">400</b></label>
  <input id="voltage" type="range" min="0" max="1000" value="400">
  <input id="voltageNumber" type="number" min="0" max="1000" value="400">

  <label for="temperature">Temperature (°C): <b id="temperatureLabel">28</b></label>
  <input id="temperature" type="range" min="-20" max="120" step=".5" value="28">
  <input id="temperatureNumber" type="number" min="-20" max="150" step=".5" value="28">

  <label for="status">Charger state</label>
  <select id="status">
    <option value="idle">Idle / Available</option>
    <option value="preparing">Preparing</option>
    <option value="charging">Charging</option>
    <option value="suspended">Suspended</option>
    <option value="finishing">Finishing</option>
    <option value="fault">Fault</option>
  </select>

  <label><input id="connected" type="checkbox" checked> Network connected</label>
  <label><input id="overheat" type="checkbox"> Simulate overheating fault</label>

  <div class="actions">
    <button id="handshake">Run mock handshake</button>
    <button id="apply" class="primary">Apply controls</button>
  </div>

  <hr style="border-color:var(--line);margin:18px 0">

  <h2>Charging session</h2>
  <label for="target">Target energy (kWh)</label>
  <input id="target" type="number" min=".1" max="1000" step=".1" value="20">
  <label for="external">External session ID (optional)</label>
  <input id="external" type="text" placeholder="Automatically generated">

  <div class="actions">
    <button id="start" class="primary">Start session</button>
    <button id="stop" class="danger">Stop session</button>
  </div>

  <p id="warning" class="notice"></p>
</section>

<section>
  <div class="panel">
    <h2>Live telemetry</h2>
    <p id="subtitle">Waiting for charger...</p>
    <div class="grid">
      <div class="metric"><small>Power</small><strong id="mPower">0 kW</strong></div>
      <div class="metric"><small>Voltage</small><strong id="mVoltage">0 V</strong></div>
      <div class="metric"><small>Current</small><strong id="mCurrent">0 A</strong></div>
      <div class="metric"><small>Temperature</small><strong id="mTemp">28 °C</strong><span id="tempState">Normal</span></div>
      <div class="metric"><small>Status</small><strong id="mStatus">Idle</strong><span id="mConnection">Connected</span></div>
      <div class="metric"><small>Heartbeat</small><strong id="heartbeat" style="font-size:13px">—</strong></div>
    </div>
    <hr style="border-color:var(--line);margin:18px 0">
    <h2>Session energy</h2>
    <strong id="energy">0.000 kWh</strong>
    <p id="energyLabel">No active session</p>
    <p id="targetLabel">Target: 20 kWh</p>
    <div style="height:8px;background:#203b4b;border-radius:8px;overflow:hidden">
      <div id="energyBar" style="height:8px;width:0;background:var(--green)"></div>
    </div>
    <p class="muted">Energy is estimated from simulated power and elapsed time.</p>
  </div>

  <div class="panel">
    <h2>Event log</h2>
    <button id="clearLog">Clear displayed log</button>
    <div id="events"></div>
  </div>

  <div class="panel">
    <h2>Recent database sessions</h2>
    <button id="reloadSessions">Reload sessions</button>
    <div id="sessions"></div>
  </div>
</section>

<aside class="panel right">
  <h2>Chargers from Neon</h2>
  <p id="count">Loading...</p>
  <div id="chargerList"></div>
  <hr style="border-color:var(--line);margin:18px 0">
  <h2>Server</h2>
  <p class="muted">GET /health</p>
  <p class="muted">GET /api/chargers</p>
  <p class="muted">GET /api/events</p>
  <p class="muted">GET /api/sessions</p>
  <p class="muted">WebSocket /ws</p>
  <p class="notice">Use mock data only. Protect simulator controls before exposing this server publicly.</p>
</aside>
</main>
<div id="toast"></div>

<script>
const $ = id => document.getElementById(id);
let data = [];
let selected = null;
let socket = null;
let currentSession = null;
let sessionEnergy = 0;
let sessionTarget = 20;
let lastEnergyTime = null;
let displayedEvents = [];

function toast(message) {
  $("toast").textContent = message;
  $("toast").style.display = "block";
  setTimeout(() => $("toast").style.display = "none", 3500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Request failed");
  }

  return result;
}

function currentCharger() {
  return data.find(c => c.id === selected);
}

function currentConnector() {
  const c = currentCharger();
  return c?.connectors?.find(x => x.id === $("connector").value);
}

function renderChargers() {
  const select = $("charger");
  const previous = selected;

  select.innerHTML = "";

  for (const c of data) {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name + " (" + c.id + ")";
    select.appendChild(option);
  }

  if (!data.length) {
    $("chargerInfo").textContent = "No charger records found.";
    $("count").textContent = "No chargers";
    return;
  }

  selected = data.some(c => c.id === previous) ? previous : data[0].id;
  select.value = selected;

  $("count").textContent = data.length + " chargers loaded";
  $("chargerList").innerHTML = "";

  for (const c of data) {
    const button = document.createElement("button");
    button.className = "charger";
    button.textContent = c.name + " · " + c.id;

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent =
      c.dbStatus + " · Max " + c.maxPowerKW + " kW";

    button.appendChild(meta);
    button.onclick = () => {
      selected = c.id;
      $("charger").value = c.id;
      selectCharger();
    };

    $("chargerList").appendChild(button);
  }

  selectCharger();
}

function selectCharger() {
  selected = $("charger").value;
  const c = currentCharger();

  if (!c) return;

  $("chargerInfo").textContent =
    (c.manufacturer || "Unknown manufacturer") + " " +
    (c.model || "") + " · Max " + c.maxPowerKW + " kW";

  $("connector").innerHTML = "";

  for (const co of c.connectors || []) {
    const option = document.createElement("option");
    option.value = co.id;
    option.textContent =
      "Connector " + co.number + " · " +
      co.type + " · " + co.status;
    $("connector").appendChild(option);
  }

  if (!c.connectors?.length) {
    const option = document.createElement("option");
    option.textContent = "No connectors in database";
    option.value = "";
    $("connector").appendChild(option);
  }

  $("power").max = c.maxPowerKW;
  $("powerNumber").max = c.maxPowerKW;
  $("power").value = Math.min(Number($("power").value), c.maxPowerKW);
  $("powerNumber").value = $("power").value;
  updateLabels();
  connectSocket();
  renderTelemetry(c.telemetry);
}

function updateLabels() {
  $("powerLabel").textContent = $("power").value + " kW";
  $("voltageLabel").textContent = $("voltage").value + " V";
  $("temperatureLabel").textContent = $("temperature").value + " °C";
}

function bindPair(slider, number) {
  $(slider).addEventListener("input", () => {
    $(number).value = $(slider).value;
    updateLabels();
  });

  $(number).addEventListener("input", () => {
    $(slider).value = $(number).value;
    updateLabels();
  });
}

bindPair("power", "powerNumber");
bindPair("voltage", "voltageNumber");
bindPair("temperature", "temperatureNumber");

function renderTelemetry(t) {
  if (!t) return;

  $("mPower").textContent = t.powerkW + " kW";
  $("mVoltage").textContent = t.voltage + " V";
  $("mCurrent").textContent = t.current + " A";
  $("mTemp").textContent = t.temperatureC + " °C";
  $("mStatus").textContent = t.status;
  $("mConnection").textContent = t.connected ? "Connected" : "Disconnected";
  $("heartbeat").textContent = t.heartbeatAt
    ? new Date(t.heartbeatAt).toLocaleTimeString()
    : "No heartbeat";

  $("tempState").textContent =
    t.overheatingFault ? "OVERHEATING FAULT" :
    t.temperatureC >= 80 ? "Temperature high" : "Normal";

  $("tempState").className =
    t.overheatingFault || t.temperatureC >= 80 ? "red" : "green";

  $("subtitle").textContent =
    "Charger " + t.chargerId + " · " +
    new Date(t.timestamp).toLocaleTimeString();

  $("connected").checked = t.connected;
  const validStatuses = ["idle", "charging", "fault", "preparing", "suspended", "finishing"];
  $("status").value = validStatuses.includes(t.status) ? t.status : "idle";
}

function connectSocket() {
  if (socket) socket.close();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(
    protocol + "//" + location.host + "/ws?chargerId=" +
    encodeURIComponent(selected)
  );

  socket.onopen = () => $("wsState").textContent = "Connected";
  socket.onclose = () => $("wsState").textContent = "Disconnected";
  socket.onerror = () => $("wsState").textContent = "Error";

  socket.onmessage = event => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "telemetry" && msg.chargerId === selected) {
        renderTelemetry(msg);
      }
    } catch {}
  };
}

function renderEvents() {
  $("events").innerHTML = "";

  if (!displayedEvents.length) {
    $("events").textContent = "No events yet.";
    return;
  }

  for (const e of displayedEvents.slice(0, 40)) {
    const div = document.createElement("div");
    div.className = "event";

    const time = document.createElement("span");
    time.textContent = new Date(e.time).toLocaleTimeString() + " ";

    const title = document.createElement("b");
    title.textContent = e.type + ": ";

    const message = document.createElement("span");
    message.textContent = e.message;

    div.append(time, title, message);
    $("events").appendChild(div);
  }
}

async function loadEvents() {
  const result = await api("/api/events");
  displayedEvents = result.events || [];
  renderEvents();
}

async function loadSessions() {
  const result = await api("/api/sessions");
  $("sessions").innerHTML = "";

  for (const s of result.sessions || []) {
    const div = document.createElement("div");
    div.className = "session";
    div.textContent =
      "#" + s.id + " · " + s.connector_id + " · " +
      s.status + " · " + (s.energy_kwh || 0) + " kWh";
    $("sessions").appendChild(div);
  }

  if (!result.sessions?.length) {
    $("sessions").textContent = "No sessions found.";
  }
}

async function refreshAll() {
  try {
    const result = await api("/api/chargers");
    data = result.chargers || [];
    renderChargers();
    $("warning").textContent = "";
    await loadEvents();
    await loadSessions();
    toast("Database refreshed.");
  } catch (e) {
    $("warning").textContent = e.message;
    toast(e.message);
  }
}

$("charger").addEventListener("change", selectCharger);

$("refresh").onclick = refreshAll;
$("reloadSessions").onclick = () => loadSessions().catch(e => toast(e.message));

$("apply").onclick = async () => {
  try {
    const result = await api("/api/simulator/control", {
      method: "POST",
      body: JSON.stringify({
        chargerId: selected,
        connectorId: $("connector").value,
        powerKW: Number($("powerNumber").value),
        voltage: Number($("voltageNumber").value),
        temperatureC: Number($("temperatureNumber").value),
        status: $("status").value,
        connected: $("connected").checked,
        overheatingFault: $("overheat").checked,
      }),
    });

    renderTelemetry(result.telemetry);
    await loadEvents();
    toast("Simulator controls applied.");
  } catch (e) {
    toast(e.message);
  }
};

$("handshake").onclick = async () => {
  try {
    const result = await api("/api/simulator/handshake", {
      method: "POST",
      body: JSON.stringify({
        chargerId: selected,
        connectorId: $("connector").value,
      }),
    });

    renderTelemetry(result.telemetry);
    await loadEvents();
    toast("Mock handshake completed.");
  } catch (e) {
    toast(e.message);
  }
};

$("start").onclick = async () => {
  try {
    const result = await api("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({
        chargerId: selected,
        connectorId: $("connector").value,
        targetEnergyKWh: Number($("target").value),
        externalSessionId: $("external").value,
      }),
    });

    currentSession = result.session;
    sessionTarget = Number($("target").value);
    sessionEnergy = 0;
    lastEnergyTime = Date.now();

    $("energyLabel").textContent = "Session #" + currentSession.id;
    $("targetLabel").textContent = "Target: " + sessionTarget + " kWh";

    await loadSessions();
    await loadEvents();
    toast("Charging session started.");
  } catch (e) {
    toast(e.message);
  }
};

$("stop").onclick = async () => {
  if (!currentSession) {
    toast("No session started in this browser.");
    return;
  }

  try {
    await api("/api/sessions/stop", {
      method: "POST",
      body: JSON.stringify({ sessionId: currentSession.id }),
    });

    currentSession = null;
    lastEnergyTime = null;

    $("energyLabel").textContent = "Session completed";
    await loadSessions();
    await loadEvents();
    toast("Session completed and saved.");
  } catch (e) {
    toast(e.message);
  }
};

$("clearLog").onclick = () => {
  displayedEvents = [];
  renderEvents();
};

setInterval(() => {
  if (!currentSession) return;

  const now = Date.now();

  if (lastEnergyTime) {
    const elapsedHours = (now - lastEnergyTime) / 3600000;
    const power = Number($("powerNumber").value);
    const charging =
      $("connected").checked &&
      $("status").value === "charging" &&
      !$("overheat").checked;

    if (charging) {
      sessionEnergy += power * elapsedHours;
    }
  }

  lastEnergyTime = now;

  $("energy").textContent = sessionEnergy.toFixed(3) + " kWh";
  $("energyBar").style.width =
    Math.min(100, sessionEnergy / sessionTarget * 100) + "%";

  if (sessionEnergy >= sessionTarget) {
    toast("Energy target reached. Stop the session to save the final reading.");
  }
}, 1000);

refreshAll();
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(page());
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        status: "ok",
        service: "Be-Electric EV Charger Simulator",
        databaseConfigured: Boolean(sql),
        mode: "mock",
      });
    }

    if (req.method === "GET" && url.pathname === "/api/chargers") {
      const result = await loadChargers();

      return json(res, 200, {
        mode: "mock",
        chargers: result,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      return json(res, 200, { events });
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      requireDatabase();

      const result = await sql`
        SELECT
          id,
          connector_id,
          external_session_id,
          status,
          started_at,
          ended_at,
          energy_kwh,
          created_at,
          account_id
        FROM public.charging_sessions
        ORDER BY created_at DESC
        LIMIT 20
      `;

      return json(res, 200, { sessions: result });
    }

    if (req.method === "POST" && url.pathname === "/api/simulator/control") {
      const input = await readBody(req);
      const result = await applyControls(input);

      return json(res, 200, { ok: true, telemetry: result });
    }

if (
  req.method === "POST" &&
  url.pathname === "/api/simulator/handshake"
) {
  const input = await readBody(req);

  try {
    // This is the action that actually runs the handshake.
    const result = await handshake(input);

    // Notify the frontend only after the handshake succeeds.
    broadcastHandshakeResult(result);

    return json(res, 200, result);
  } catch (error) {
    // Notify the frontend if the handshake fails too.
    broadcastHandshakeResult({
      ok: false,
      chargerId: String(input.chargerId || ""),
      connectorId: String(input.connectorId || ""),
      error: error.message || "Mock handshake failed.",
    });

    throw error;
  }
}

    if (req.method === "POST" && url.pathname === "/api/sessions/start") {
      const input = await readBody(req);
      const session = await startSession(input);

      return json(res, 201, { session });
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/stop") {
      const input = await readBody(req);
      const session = await stopSession(input);

      return json(res, 200, { ok: true, session });
    }

    // Optional authorized live telemetry endpoint.
    if (req.method === "POST" && url.pathname === "/api/telemetry") {
      if (!LIVE_INGEST_TOKEN) {
        return json(res, 503, {
          error: "LIVE_INGEST_TOKEN is not configured.",
        });
      }

      if (req.headers.authorization !== "Bearer " + LIVE_INGEST_TOKEN) {
        return json(res, 401, { error: "Unauthorized." });
      }

      requireDatabase();

      const input = await readBody(req);
      const id = String(input.chargerId || "");
      const c = chargers.get(id);

      if (!c) throw new Error("Unknown charger ID.");

      const power = Number(input.powerKW ?? input.powerkW);
      const voltage = Number(input.voltage);
      const current = Number(input.current);
      const temp = input.temperatureC == null
        ? null
        : Number(input.temperatureC);

      if (
        ![power, voltage, current].every(
          n => Number.isFinite(n) && n >= 0
        ) ||
        power > 500 ||
        voltage > 1000 ||
        current > 1000 ||
        (temp !== null && (!Number.isFinite(temp) || temp < -20 || temp > 150))
      ) {
        throw new Error("Invalid telemetry values.");
      }

      const reading = {
        chargerId: id,
        powerkW: power,
        voltage,
        current,
        temperatureC: temp,
        status: String(input.status || "idle"),
        connected: input.connected === true,
        dataSource: "live",
        timestamp: new Date().toISOString(),
      };

      await sql`
        INSERT INTO public.charger_telemetry (
          charger_id,
          recorded_at,
          source,
          power_kw,
          temperature_c,
          voltage_v,
          current_a,
          heartbeat_at,
          raw_payload
        )
        VALUES (
          ${id},
          NOW(),
          'live',
          ${power},
          ${temp},
          ${voltage},
          ${current},
          NOW(),
          ${JSON.stringify(input)}::jsonb
        )
      `;

      log("live-telemetry", id, "Live telemetry received.");

      for (const client of wss.clients) {
        if (
          client.readyState === WebSocket.OPEN &&
          (!client.chargerId || client.chargerId === id)
        ) {
          client.send(JSON.stringify({
            type: "telemetry",
            ...reading,
          }));
        }
      }

      return json(res, 200, { ok: true, chargerId: id });
    }

    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(req.method, url.pathname, error);

    return json(res, 400, {
      error: error.message || "Request failed.",
    });
  }
});


wss = new WebSocketServer({ noServer: true });

const ocppWss = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols) {
    return protocols.has("ocpp1.6") ? "ocpp1.6" : false;
  },
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(
    request.url,
    "http://" + (request.headers.host || "localhost")
  ).pathname;

  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
    return;
  }

  if (/^\/ocpp\/[^/]+$/.test(pathname)) {
    const protocols = String(
      request.headers["sec-websocket-protocol"] || ""
    )
      .split(",")
      .map((p) => p.trim());

    if (!protocols.includes("ocpp1.6")) {
      socket.write(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"
      );
      socket.destroy();
      return;
    }

    ocppWss.handleUpgrade(request, socket, head, (ws) => {
      ocppWss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

  
wss.on("connection", (socket, request) => {
  const url = new URL(request.url, "http://localhost");

  socket.chargerId = url.searchParams.get("chargerId");
  socket.connectorId = url.searchParams.get("connectorId");

  // Load the charger list before sending telemetry or
  // accepting any commands from this WebSocket client.
  const ready = (async () => {
    try {
      const result = await loadChargers();

      if (
        socket.chargerId &&
        !chargers.has(socket.chargerId)
      ) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1008, "Unknown charger ID");
        }
        return;
      }

      if (socket.readyState !== WebSocket.OPEN) return;

      // Send initial telemetry. This does NOT run a handshake.
      for (const c of result) {
        if (
          !socket.chargerId ||
          socket.chargerId === c.id
        ) {
          socket.send(
            JSON.stringify({
              type: "telemetry",
              ...c.telemetry,
            })
          );
        }
      }
    } catch (error) {
      console.error("WebSocket initialization failed:", error);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: error.message || "Failed to load chargers.",
          })
        );
      }
    }
  })();

  // Only an explicit RUN_HANDSHAKE message starts a handshake.
  socket.on("message", async (raw) => {
    try {
      await ready;

      if (socket.readyState !== WebSocket.OPEN) return;

      let input;

      try {
        input = JSON.parse(raw.toString());
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            error: "Invalid JSON message.",
          })
        );
        return;
      }

      if (input.type !== "RUN_HANDSHAKE") {
        socket.send(
          JSON.stringify({
            type: "error",
            error: "Unsupported WebSocket command.",
          })
        );
        return;
      }

      console.log("Explicit handshake request received:", {
        chargerId: input.chargerId,
        connectorId: input.connectorId,
      });

      const result = await handshake({
        chargerId: String(input.chargerId || ""),
        connectorId: String(input.connectorId || ""),
      });

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "handshake_result",
            ...result,
          })
        );
      }
    } catch (error) {
      console.error("WebSocket handshake failed:", error);

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "handshake_result",
            ok: false,
            error: error.message || "Mock handshake failed.",
          })
        );
      }
    }
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});



// Update simulated session energy and persist telemetry every 5 seconds.
setInterval(async () => {
  for (const c of chargers.values()) {
    try {
      const active = c.connectors
        .map(co => activeSessions.get(co.id))
        .find(Boolean);

      if (active) {
        const now = Date.now();
        const elapsedHours = (now - active.lastMs) / 3600000;

        if (
          c.connected &&
          c.status === "charging" &&
          !c.overheatingFault
        ) {
          active.energy += Math.max(0, elapsedHours) * c.powerKW;
        }

        active.lastMs = now;

        if (active.energy >= active.target) {
          active.energy = active.target;

          await stopSession({ sessionId: active.id });
        }
      }

      broadcast(c.id);
      await saveTelemetry(c);
    } catch (error) {
      log("database-error", c.id, "Periodic update failed", {
        error: error.message,
      });
    }
  }
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "Be-Electric simulator listening on port " + PORT +
    "; database configured: " + Boolean(sql) +
    "; WebSocket: /ws"
  );
});
