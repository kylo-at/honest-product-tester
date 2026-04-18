import { NextResponse } from "next/server";

import { getRun } from "@/lib/runs";

type RouteProps = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  const { runId } = await params;

  try {
    const run = await getRun(runId);
    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
}
