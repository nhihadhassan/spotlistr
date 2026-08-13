import { NextResponse } from "next/server";
import { z } from "zod";
import { getTopAlbums, LastFmError } from "@/lib/lastfm/client";

const querySchema = z.object({
  user: z.string().trim().min(1).max(64),
  period: z.enum(["7day", "1month", "3month", "6month", "12month", "overall"]),
  limit: z.coerce.number().int().min(1).max(100),
});

/** GET /api/lastfm/top-albums — public, no sign-in required. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    user: searchParams.get("user"),
    period: searchParams.get("period") ?? "7day",
    limit: searchParams.get("limit") ?? "25",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Bad request" },
      { status: 400 },
    );
  }

  try {
    const albums = await getTopAlbums(
      parsed.data.user,
      parsed.data.period,
      parsed.data.limit,
    );
    return NextResponse.json({ albums });
  } catch (err) {
    if (err instanceof LastFmError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error in /api/lastfm/top-albums", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
