import { promises as fs } from "node:fs";
import path from "node:path";

import matter from "gray-matter";

export const defaultPersonaOrder = [
  "dark-muckerberg",
  "cardi-confused",
  "chef-lamb-sauce",
  "tom-thanks",
  "sir-stack-overflow",
  "multitasking-millie",
] as const;

const defaultPersonaOrderIndex = new Map<string, number>(
  defaultPersonaOrder.map((id, index) => [id, index]),
);

export type Persona = {
  id: string;
  name: string;
  inspiredBy: string;
  avatar: string;
  voice: string;
  experienceLevel: string;
  patience: string;
  goals: string[];
  interests: string[];
  dislikes: string[];
  browseStyle: string[];
  reportSections: string[];
  prompt: string;
};

type PersonaFrontmatter = {
  id: string;
  name: string;
  inspired_by: string;
  avatar: string;
  voice: string;
  experience_level: string;
  patience: string;
  goals?: string[];
  interests?: string[];
  dislikes?: string[];
  browse_style?: string[];
  report_sections?: string[];
};

const personasDir = path.join(process.cwd(), "personas");

export function comparePersonaIds(leftId: string, rightId: string) {
  const leftIndex =
    defaultPersonaOrderIndex.get(leftId) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex =
    defaultPersonaOrderIndex.get(rightId) ?? Number.MAX_SAFE_INTEGER;

  return leftIndex - rightIndex;
}

export async function getPersonas(): Promise<Persona[]> {
  const files = await fs.readdir(personasDir);
  const markdownFiles = files.filter((file) => file.endsWith(".md")).sort();

  const personas = await Promise.all(
    markdownFiles.map(async (file) => {
      const fullPath = path.join(personasDir, file);
      const raw = await fs.readFile(fullPath, "utf8");
      const { data, content } = matter(raw);
      const frontmatter = data as PersonaFrontmatter;
      const fallbackId = path.basename(file, ".md");

      return {
        id: frontmatter.id?.trim() || fallbackId,
        name: frontmatter.name?.trim() || fallbackId,
        inspiredBy: frontmatter.inspired_by?.trim() || "Unknown",
        avatar: frontmatter.avatar?.trim() || "/personas/beginner.png",
        voice: frontmatter.voice?.trim() || "Direct",
        experienceLevel: frontmatter.experience_level?.trim() || "Unknown",
        patience: frontmatter.patience?.trim() || "Unknown",
        goals: frontmatter.goals ?? [],
        interests: frontmatter.interests ?? [],
        dislikes: frontmatter.dislikes ?? [],
        browseStyle: frontmatter.browse_style ?? [],
        reportSections: frontmatter.report_sections ?? [],
        prompt: content.trim(),
      } satisfies Persona;
    }),
  );

  return personas.sort((left, right) => {
    const indexDelta = comparePersonaIds(left.id, right.id);

    if (indexDelta !== 0) {
      return indexDelta;
    }

    return left.name.localeCompare(right.name);
  });
}
