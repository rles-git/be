import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getAuthenticatedAccountId, getSql } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(url);
}

// Must use the same verified session lookup as the GET/POST route.
async function getAuthenticatedAccountId(
  _request: NextRequest
): Promise<string | null> {
  // Connect your existing authentication/session logic here.
  return null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  try {
    const accountId = await getAuthenticatedAccountId(request);

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
