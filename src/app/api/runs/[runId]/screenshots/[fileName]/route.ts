import { promises as fs } from "node:fs";
import path from "node:path";

type RouteProps = {
  params: Promise<{
    runId: string;
    fileName: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  const { runId, fileName } = await params;
  const safeFileName = path.basename(fileName);
  const screenshotPath = path.join(
    process.cwd(),
    "data",
    "runs",
    runId,
    "screenshots",
    safeFileName,
  );

  try {
    const file = await fs.readFile(screenshotPath);

    return new Response(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
