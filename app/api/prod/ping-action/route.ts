import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(
    JSON.stringify({
      ok: true,
      message: "pong",
      source: "prod-ping-action",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}