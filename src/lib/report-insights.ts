export const REPORT_INSIGHT_DEFINITIONS = [
  {
    id: "elevatorPitch",
    title: "The User's Elevator Pitch",
    question:
      "If you had to describe this product to a friend or colleague, what would you say?",
    info: "Do they actually understand what the product is for?",
    icon: "messageSquare",
  },
  {
    id: "biggestFrustrations",
    title: "Biggest Frustrations",
    question: "What was the most frustrating part of clicking around today?",
    info: "Where did the UX fail them the most?",
    icon: "triangleAlert",
  },
  {
    id: "unexpectedElements",
    title: "Unexpected Elements",
    question: "Was there anything that surprised you, either in a good or a bad way?",
    info: "Where do user expectations misalign with the design?",
    icon: "sparkles",
  },
  {
    id: "magicWandFix",
    title: "The 'Magic Wand' Fix",
    question:
      "If you had a magic wand and could change exactly one thing... what would it be?",
    info: "What is the highest-priority barrier to adoption?",
    icon: "wandSparkles",
  },
] as const;

export type ReportInsightId = (typeof REPORT_INSIGHT_DEFINITIONS)[number]["id"];

export type PersonaReportInsight = {
  id: ReportInsightId;
  answer: string;
};
