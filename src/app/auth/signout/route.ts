import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  await clearSession();
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
