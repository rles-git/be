
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedAccountId,
  getSql,
} from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  try {
    // Verify the signed-in account.
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to remove saved stations." },
        { status: 401 }
      );
    }

    // Get the station ID from the URL.
    const { stationId: rawStationId } = await params;
    const stationId = rawStationId.trim().toUpperCase();

    // Accept IDs such as Q001, Q002, ..., Q006.
    if (!/^Q\d{3}$/.test(stationId)) {
      return NextResponse.json(
        { error: "Invalid station ID. Expected a format like Q001." },
        { status: 400 }
      );
    }

    const sql = getSql();

    // Match the station's actual database ID and delete only
    // the saved entry belonging to the authenticated account.
    const result = await sql`
      DELETE FROM public.saved_stations AS ss
      WHERE ss.account_id = ${accountId}
        AND ss.station_id = (
          SELECT s.id
          FROM public.stations AS s
          WHERE s.id::text = ${stationId}
          LIMIT 1
        )
      RETURNING ss.station_id
    `;

    return NextResponse.json(
      {
        success: true,
        station_id: stationId,
        removed: result.length > 0,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("DELETE saved station error:", error);

    return NextResponse.json(
      { error: "Unable to remove saved station." },
      { status: 500 }
    );
  }
}
