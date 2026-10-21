import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccountId, getSql } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  try {
    const accountId = await getAuthenticatedAccountId();

    if (!accountId) {
      return NextResponse.json(
        { error: "Please sign in to remove saved stations." },
        { status: 401 }
      );
    }

    const { stationId } = await params;

    if (!/^\d+$/.test(stationId)) {
      return NextResponse.json(
        { error: "Invalid station ID." },
        { status: 400 }
      );
    }

    const sql = getSql();

    await sql`
      DELETE FROM saved_stations
      WHERE account_id = ${accountId}
        AND station_id = ${stationId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE saved station error:", error);

    return NextResponse.json(
      { error: "Unable to remove saved station." },
      { status: 500 }
    );
  }
}
