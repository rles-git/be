
import { NextResponse } from "next/server";
import { getSql } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const sql = getSql();

    // Diagnostic: identify the database connection used by this request.
    const connectionInfo = await sql`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        current_schema() AS schema_name,
        current_setting('search_path') AS search_path,
        inet_server_port() AS server_port,
        pg_is_in_recovery() AS is_replica
    `;

    // Diagnostic: read Q001 directly from the deployed database connection.
    const rowCheck = await sql`
      SELECT
        id,
        name,
        short_name,
        xmin::text AS row_version
      FROM public.stations
      WHERE id = 'Q001'
      LIMIT 1
    `;

    // Existing diagnostic query.
    const diagnostic = await sql`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        id,
        name,
        short_name,
        address
      FROM public.stations
      WHERE id = 'Q001'
      LIMIT 1
    `;

    // Fetch stations, chargers, and connectors.
    const stations = await sql`
      SELECT
        s.id,
        s.name,
        s.short_name,
        s.address,
        s.lat,
        s.lng,
        s.available,
        s.power,
        s.price,
        s.kind,
        s.distance,
        s.minutes,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ch.id,
                'station_id', ch.station_id,
                'name', ch.name,
                'manufacturer', ch.manufacturer,
                'model', ch.model,
                'serial_number', ch.serial_number,
                'max_power_kw', ch.max_power_kw,
                'status', ch.status,
                'protocol', ch.protocol,
                'protocol_identity', ch.protocol_identity,
                'connectors', COALESCE(
                  (
                    SELECT json_agg(
                      json_build_object(
                        'id', co.id,
                        'charger_id', co.charger_id,
                        'connector_number', co.connector_number,
                        'connector_type', co.connector_type,
                        'max_power_kw', co.max_power_kw,
                        'status',
                        CASE
                          WHEN EXISTS (
                            SELECT 1
                            FROM public.charging_sessions cs
                            WHERE cs.connector_id = co.id::text
                              AND cs.status IN ('pending', 'active')
                          )
                          THEN 'In use'
                          ELSE co.status
                        END
                      )
                      ORDER BY co.connector_number ASC
                    )
                    FROM public.connectors co
                    WHERE co.charger_id = ch.id
                  ),
                  '[]'::json
                )
              )
              ORDER BY ch.id ASC
            )
            FROM public.chargers ch
            WHERE ch.station_id = s.id
          ),
          '[]'::json
        ) AS chargers
      FROM public.stations s
      ORDER BY s.id ASC
    `;

    // Map database fields to the names expected by the frontend.
    const normalizedStations: Array<Record<string, any>> =
      stations.map((station: Record<string, any>) => ({
        ...station,
        shortName: station.short_name,
      }));

    // Run another direct query to compare Q001's short name.
    const shortNameCheck = await sql`
      SELECT
        id,
        short_name
      FROM public.stations
      WHERE id = 'Q001'
      LIMIT 1
    `;

    const q001 = normalizedStations.find(
      (station) => String(station.id) === "Q001"
    );

    console.log("Station API diagnostics:", {
      connectionInfo: connectionInfo[0] ?? null,
      rowCheck: rowCheck[0] ?? null,
      diagnostic: diagnostic[0] ?? null,
      secondQuery: shortNameCheck[0] ?? null,
      normalizedQ001: q001
        ? {
            id: q001.id,
            name: q001.name,
            shortName: q001.shortName,
          }
        : null,
      stationCount: normalizedStations.length,
    });

    // Return diagnostics only when explicitly requested.
    if (new URL(request.url).searchParams.get("debug") === "1") {
      return NextResponse.json(
        {
          connectionInfo: connectionInfo[0] ?? null,
          rowCheck: rowCheck[0] ?? null,
          diagnostic: diagnostic[0] ?? null,
          secondQuery: shortNameCheck[0] ?? null,
          normalQueryQ001: q001 ?? null,
          stationCount: normalizedStations.length,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    }

    // Normal API response.
    return NextResponse.json(normalizedStations, {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error(
      "Failed to fetch stations, chargers, and connectors:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch charging stations, chargers, and connectors.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
