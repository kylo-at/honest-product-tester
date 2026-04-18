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

export async function getPersonas(): Promise<Persona[]> {
  const files = await fs.readdir(personasDir);
  const markdownFiles = files.filter((file) => file.endsWith(".md")).sort();

  const personas = await Promise.all(
    markdownFiles.map(async (file) => {
      const fullPath = path.join(personasDir, file);
      const raw = await fs.readFile(fullPath, "utf8");
      const { data, content } = matter(raw);
      const frontmatter = data as PersonaFrontmatter;

      return {
        id: frontmatter.id,
        name: frontmatter.name,
        inspiredBy: frontmatter.inspired_by,
        avatar: frontmatter.avatar,
        voice: frontmatter.voice,
        experienceLevel: frontmatter.experience_level,
        patience: frontmatter.patience,
        goals: frontmatter.goals ?? [],
        interests: frontmatter.interests ?? [],
        dislikes: frontmatter.dislikes ?? [],
        browseStyle: frontmatter.browse_style ?? [],
        reportSections: frontmatter.report_sections ?? [],
        prompt: content.trim(),
      } satisfies Persona;
    }),
  );

  const orderIndex = new Map<string, number>(
    defaultPersonaOrder.map((id, index) => [id, index]),
  );

  return personas.sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.name.localeCompare(right.name);
  });
}
