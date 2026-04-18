"use server";

import { redirect } from "next/navigation";

import { getPersonas } from "@/lib/personas";
import { ensureRunStarted } from "@/lib/run-executor";
import { createRun } from "@/lib/runs";

export async function startRunAction(formData: FormData) {
  const urlValue = formData.get("url");
  const url = typeof urlValue === "string" ? urlValue : "";
  const personas = await getPersonas();
  const run = await createRun(url, personas);
  ensureRunStarted(run.id);

  redirect(`/runs/${run.id}`);
}
