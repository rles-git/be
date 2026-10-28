
"use strict";

const http = require("http");
const { randomUUID } = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const { neon } = require("@neondatabase/serverless");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const API_TOKEN = process.env.API_TOKEN;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const sql = neon(DATABASE_URL);

// Connected physical chargers, keyed by their OCPP identity.
const connectedChargers = new Map();

// Pending OCPP commands sent by this server to chargers.
const pendingCommands = new Map();

const OCPP_SUBPROTOCOL = "ocpp1.6";

// -----------------------------------------------------------------------------
// Database initialization
// -----------------------------------------------------------------------------

async function initializeDatabase() {
  await sql`
    CREATE SEQUENCE IF NOT EXISTS public.ocpp_transaction_id_seq
    START WITH 1000
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS public.ocpp_transactions (
      transaction_id BIGINT PRIMARY KEY,
      charger_id VARCHAR(20) NOT NULL,
      connector_id VARCHAR(100) NOT NULL,
      charging_session_id TEXT NOT NULL,
      meter_start_wh NUMERIC NOT NULL DEFAULT 0,
      last_meter_wh NUMERIC NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      stopped_at TIMESTAMPTZ
    )
  `;

  console.log("Database initialized");
}

// -----------------------------------------------------------------------------
// General helpers
// -----------------------------------------------------------------------------

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function validDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function sendFrame(socket, frame) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(frame));
  }
}

function sendCallResult(socket, messageId, payload) {
  sendFrame(socket, [3, messageId, payload]);
}

function sendCallError(socket, messageId, code, description) {
  sendFrame(socket, [4, messageId, code, description, {}]);
}

function mapOcppStatus(status) {
  switch (status) {
    case "Available":
      return "available";

    case "Charging":
    case "Preparing":
    case "SuspendedEV":
    case "SuspendedEVSE":
    case "Finishing":
    case "Reserved":
      return "charging";

    case "Faulted":
      return "fault";

    case "Unavailable":
      return "offline";

    default:
      return "unknown";
  }
}

async function findCharger(chargePointIdentity) {
  const rows = await sql`
    SELECT id, protocol_identity
    FROM public.chargers
    WHERE id = ${chargePointIdentity}
       OR protocol_identity = ${chargePointIdentity}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function findConnector(chargerId, connectorNumber) {
  const rows = await sql`
    SELECT id, connector_number
    FROM public.connectors
    WHERE charger_id = ${chargerId}
      AND connector_number = ${connectorNumber}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function updateConnectorStatus(connectorId, status) {
  await sql`
    UPDATE public.connectors
    SET status = ${status}
    WHERE id = ${connectorId}
  `;
}

// -----------------------------------------------------------------------------
// OCPP commands: server -> physical charger
// -----------------------------------------------------------------------------

function sendOcppCommand(socket, action, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("Charger is not connected"));
  }

  const messageId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(messageId);
      reject(new Error(`Charger timed out waiting for ${action}`));
    }, 30_000);

    pendingCommands.set(messageId, {
      resolve,
      reject,
      timeout,
      action,
    });

    sendFrame(socket, [2, messageId, action, payload]);
  });
}

function resolveOcppCommand(messageId, payload) {
  const pending = pendingCommands.get(messageId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingCommands.delete(messageId);
  pending.resolve(payload);
}

function rejectOcppCommand(messageId, code, description) {
  const pending = pendingCommands.get(messageId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingCommands.delete(messageId);

  pending.reject(
    new Error(`${pending.action} failed: ${code} ${description}`)
  );
}

// -----------------------------------------------------------------------------
// OCPP transaction handling: charger -> server
// -----------------------------------------------------------------------------

async function handleStartTransaction(socket, chargePointIdentity, payload) {
  const charger = await findCharger(chargePointIdentity);

  if (!charger) {
    return {
      transactionId: 0,
      idTagInfo: { status: "Invalid" },
    };
  }

  const connectorNumber = Number(payload.connectorId);
  const meterStartWh = Number(payload.meterStart);

  if (
    !isPositiveInteger(connectorNumber) ||
    !Number.isFinite(meterStartWh) ||
    meterStartWh < 0
  ) {
    return {
      transactionId: 0,
      idTagInfo: { status: "Invalid" },
    };
  }

  const connector = await findConnector(charger.id, connectorNumber);

  if (!connector) {
    return {
      transactionId: 0,
      idTagInfo: { status: "Invalid" },
    };
  }

  // Do not allow two active sessions on the same connector.
  const existing = await sql`
    SELECT id
    FROM public.charging_sessions
    WHERE connector_id = ${connector.id}
      AND status = 'active'
    LIMIT 1
  `;

  if (existing.length > 0) {
    console.warn("Connector already has an active session:", connector.id);

    return {
      transactionId: 0,
      idTagInfo: { status: "ConcurrentTx" },
    };
  }

  const sequenceRows = await sql`
    SELECT nextval('public.ocpp_transaction_id_seq') AS id
  `;

  const transactionId = Number(sequenceRows[0].id);
  const startedAt = validDate(payload.timestamp);
  const externalSessionId = `ocpp:${transactionId}`;

  // Insert into your existing charging_sessions table.
  const sessions = await sql`
    INSERT INTO public.charging_sessions (
      connector_id,
      external_session_id,
      status,
      started_at,
      energy_kwh
    )
    VALUES (
      ${connector.id},
      ${externalSessionId},
      'active',
      ${startedAt.toISOString()},
      0
    )
    RETURNING id::text AS id
  `;

  const session = sessions[0];

  // Store the OCPP transaction -> application session mapping.
  await sql`
    INSERT INTO public.ocpp_transactions (
      transaction_id,
      charger_id,
      connector_id,
      charging_session_id,
      meter_start_wh,
      last_meter_wh,
      status,
      started_at
    )
    VALUES (
      ${transactionId},
      ${charger.id},
      ${connector.id},
      ${session.id},
      ${meterStartWh},
      ${meterStartWh},
      'active',
      ${startedAt.toISOString()}
    )
  `;

  await updateConnectorStatus(connector.id, "charging");

  console.log(
    `Charging started: charger=${charger.id}, connector=${connector.id}, transaction=${transactionId}`
  );

  return {
    transactionId,
    idTagInfo: { status: "Accepted" },
  };
}

async function handleMeterValues(chargePointIdentity, payload) {
  const transactionId = Number(payload.transactionId);

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return;
  }

  const transactions = await sql`
    SELECT
      transaction_id,
      charging_session_id,
      meter_start_wh
    FROM public.ocpp_transactions
    WHERE transaction_id = ${transactionId}
      AND status = 'active'
    LIMIT 1
  `;

  const transaction = transactions[0];
  if (!transaction) return;

  let latestMeterWh = null;

  for (const meterValue of payload.meterValue || []) {
    for (const sample of meterValue.sampledValue || []) {
      if (sample.measurand !== "Energy.Active.Import.Register") {
        continue;
      }

      const value = Number(sample.value);
      if (!Number.isFinite(value) || value < 0) continue;

      const unit = sample.unit || "Wh";

      if (unit === "kWh") {
        latestMeterWh = value * 1000;
      } else if (unit === "Wh") {
        latestMeterWh = value;
      }
    }
  }

  if (latestMeterWh === null) return;

  const meterStartWh = Number(transaction.meter_start_wh);
  const energyKwh = Math.max(0, latestMeterWh - meterStartWh) / 1000;

  await sql`
    UPDATE public.ocpp_transactions
    SET last_meter_wh = ${latestMeterWh}
    WHERE transaction_id = ${transactionId}
      AND status = 'active'
  `;

  await sql`
    UPDATE public.charging_sessions
    SET energy_kwh = ${energyKwh}
    WHERE id::text = ${transaction.charging_session_id}
      AND status = 'active'
  `;

  console.log(
    `Meter update: transaction=${transactionId}, energy=${energyKwh.toFixed(3)} kWh`
  );
}

async function handleStopTransaction(payload) {
  const transactionId = Number(payload.transactionId);

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return { idTagInfo: { status: "Invalid" } };
  }

  const transactions = await sql`
    SELECT *
    FROM public.ocpp_transactions
    WHERE transaction_id = ${transactionId}
      AND status = 'active'
    LIMIT 1
  `;

  const transaction = transactions[0];

  // A duplicate StopTransaction should not create another completed session.
  if (!transaction) {
    return { idTagInfo: { status: "Accepted" } };
  }

  const meterStartWh = Number(transaction.meter_start_wh);
  const lastMeterWh = Number(transaction.last_meter_wh);

  const receivedMeterStop = Number(payload.meterStop);
  const meterStopWh =
    Number.isFinite(receivedMeterStop) && receivedMeterStop >= 0
      ? receivedMeterStop
      : lastMeterWh;

  const energyKwh = Math.max(0, meterStopWh - meterStartWh) / 1000;
  const endedAt = validDate(payload.timestamp);

  await sql`
    UPDATE public.charging_sessions
    SET
      status = 'completed',
      ended_at = ${endedAt.toISOString()},
      energy_kwh = ${energyKwh}
    WHERE id::text = ${transaction.charging_session_id}
      AND status = 'active'
  `;

  await sql`
    UPDATE public.ocpp_transactions
    SET
      status = 'completed',
      stopped_at = ${endedAt.toISOString()},
      last_meter_wh = ${meterStopWh}
    WHERE transaction_id = ${transactionId}
      AND status = 'active'
  `;

  await updateConnectorStatus(transaction.connector_id, "available");

  console.log(
    `Charging stopped: transaction=${transactionId}, energy=${energyKwh.toFixed(3)} kWh`
  );

  return { idTagInfo: { status: "Accepted" } };
}

// -----------------------------------------------------------------------------
// Incoming OCPP messages
// -----------------------------------------------------------------------------

async function handleOcppMessage(socket, chargePointIdentity, rawMessage) {
  let message;

  try {
    message = JSON.parse(rawMessage.toString());
  } catch {
    console.error("Invalid OCPP JSON from", chargePointIdentity);
    return;
  }

  if (!Array.isArray(message) || message.length < 3) {
    console.error("Invalid OCPP frame from", chargePointIdentity);
    return;
  }

  const messageType = message[0];
  const messageId = message[1];

  // CALLRESULT: response to a command initiated by this server.
  if (messageType === 3) {
    resolveOcppCommand(messageId, message[2] || {});
    return;
  }

  // CALLERROR: command initiated by this server failed.
  if (messageType === 4) {
    rejectOcppCommand(messageId, message[2], message[3]);
    return;
  }

  // We only process CALL frames from the charger below.
  if (messageType !== 2 || typeof message[2] !== "string") {
    return;
  }

  const action = message[2];
  const payload = message[3] || {};

  try {
    let response;

    switch (action) {
      case "BootNotification":
        response = {
          status: "Accepted",
          currentTime: new Date().toISOString(),
          interval: 60,
        };
        break;

      case "Heartbeat":
        response = { currentTime: new Date().toISOString() };
        break;

      case "Authorize":
        // Demo only: production systems must validate idTag credentials.
        response = {
          idTagInfo: { status: "Accepted" },
        };
        break;

      case "StartTransaction":
        response = await handleStartTransaction(
          socket,
          chargePointIdentity,
          payload
        );
        break;

      case "MeterValues":
        await handleMeterValues(chargePointIdentity, payload);
        response = {};
        break;

      case "StopTransaction":
        response = await handleStopTransaction(payload);
        break;

      case "StatusNotification": {
        const charger = await findCharger(chargePointIdentity);

        if (charger) {
          const status = mapOcppStatus(payload.status);
          const connectorNumber = Number(payload.connectorId);

          if (connectorNumber === 0) {
            await sql`
              UPDATE public.chargers
              SET status = ${status}
              WHERE id = ${charger.id}
            `;
          } else if (Number.isInteger(connectorNumber)) {
            const connector = await findConnector(
              charger.id,
              connectorNumber
            );

            if (connector) {
              await updateConnectorStatus(connector.id, status);
            }
          }
        }

        response = {};
        break;
      }

      default:
        sendCallError(
          socket,
          messageId,
          "NotSupported",
          `Action ${action} is not supported`
        );
        return;
    }

    sendCallResult(socket, messageId, response);
  } catch (error) {
    console.error(`OCPP ${action} failed:`, error);

    sendCallError(
      socket,
      messageId,
      "InternalError",
      "The server could not process the request"
    );
  }
}

// -----------------------------------------------------------------------------
// HTTP server and API
// -----------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "be-electric-ocpp",
      connectedChargers: connectedChargers.size,
      time: new Date().toISOString(),
    });
  }

  if (
    req.method === "GET" &&
    url.pathname === "/api/ocpp/chargers"
  ) {
    return sendJson(res, 200, {
      chargers: [...connectedChargers.keys()],
    });
  }

  // Do not expose remote charging controls without a configured secret.
  if (
    url.pathname === "/api/ocpp/remote-start" ||
    url.pathname === "/api/ocpp/remote-stop"
  ) {
    if (!API_TOKEN) {
      return sendJson(res, 503, {
        error: "API_TOKEN is not configured",
      });
    }

    if (req.headers.authorization !== `Bearer ${API_TOKEN}`) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Use POST" });
    }

    try {
      const body = await parseJsonBody(req);
      const chargePointIdentity = String(body.chargePointId || "");
      const socket = connectedChargers.get(chargePointIdentity);

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return sendJson(res, 409, {
          error: "Charger is not connected",
          chargePointId: chargePointIdentity,
        });
      }

      if (url.pathname === "/api/ocpp/remote-start") {
        const connectorId = Number(body.connectorId || 1);
        const idTag = String(body.idTag || "BE-ELECTRIC-DEMO");

        if (
          !isPositiveInteger(connectorId) ||
          !idTag ||
          idTag.length > 20
        ) {
          return sendJson(res, 400, {
            error: "Valid connectorId and idTag are required",
          });
        }

        const result = await sendOcppCommand(
          socket,
          "RemoteStartTransaction",
          { connectorId, idTag }
        );

        return sendJson(res, 200, {
          ok: true,
          action: "RemoteStartTransaction",
          chargerResponse: result,
          note:
            "A session is recorded after the charger sends StartTransaction.",
        });
      }

      const transactionId = Number(body.transactionId);

      if (!Number.isInteger(transactionId) || transactionId <= 0) {
        return sendJson(res, 400, {
          error: "A valid transactionId is required",
        });
      }

      const result = await sendOcppCommand(
        socket,
        "RemoteStopTransaction",
        { transactionId }
      );

      return sendJson(res, 200, {
        ok: true,
        action: "RemoteStopTransaction",
        chargerResponse: result,
        note:
          "The session is completed when the charger sends StopTransaction.",
      });
    } catch (error) {
      console.error("Remote command failed:", error);
      return sendJson(res, 502, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, 200, {
      service: "Be-Electric OCPP 1.6J",
      endpoints: [
        "GET /health",
        "GET /api/ocpp/chargers",
        "POST /api/ocpp/remote-start",
        "POST /api/ocpp/remote-stop",
      ],
    });
  }

  sendJson(res, 404, { error: "Not found" });
});

// -----------------------------------------------------------------------------
// OCPP WebSocket endpoint: /ocpp/{chargePointIdentity}
// -----------------------------------------------------------------------------

const ocppWss = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols) {
    return protocols.has(OCPP_SUBPROTOCOL) ? OCPP_SUBPROTOCOL : false;
  },
});

server.on("upgrade", (req, socket, head) => {
  let url;

  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    socket.destroy();
    return;
  }

  const match = url.pathname.match(/^\/ocpp\/([^/]+)$/);

  if (!match) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const chargePointIdentity = decodeURIComponent(match[1]);

  if (!chargePointIdentity || chargePointIdentity.length > 100) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const protocols = String(req.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((protocol) => protocol.trim());

  if (!protocols.includes(OCPP_SUBPROTOCOL)) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  ocppWss.handleUpgrade(req, socket, head, (ws) => {
    ocppWss.emit("connection", ws, req, chargePointIdentity);
  });
});

ocppWss.on("connection", (socket, req, chargePointIdentity) => {
  console.log(`OCPP connection opened: ${chargePointIdentity}`);

  const previousSocket = connectedChargers.get(chargePointIdentity);

  if (previousSocket && previousSocket !== socket) {
    previousSocket.close(1000, "Replaced by a newer connection");
  }

  connectedChargers.set(chargePointIdentity, socket);

  socket.on("message", (message) => {
    void handleOcppMessage(socket, chargePointIdentity, message);
  });

  socket.on("close", () => {
    if (connectedChargers.get(chargePointIdentity) === socket) {
      connectedChargers.delete(chargePointIdentity);
    }

    console.log(`OCPP connection closed: ${chargePointIdentity}`);
  });

  socket.on("error", (error) => {
    console.error(`OCPP socket error (${chargePointIdentity}):`, error);
  });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

async function main() {
  await initializeDatabase();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Be-Electric OCPP server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log("OCPP WebSocket path: /ocpp/{chargePointIdentity}");
    console.log(`OCPP subprotocol: ${OCPP_SUBPROTOCOL}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
