export type AdvisorModel = {
  id: string;
  label: string;
  tier: "cheap" | "moderate" | "expensive";
  hint: string;
};

export const ADVISOR_MODELS: AdvisorModel[] = [
  { id: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", tier: "cheap", hint: "Cheapest · fastest" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (default)", tier: "cheap", hint: "Balanced default" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "cheap", hint: "Multimodal" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", tier: "cheap", hint: "Coding · agents" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "moderate", hint: "Complex reasoning" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "moderate", hint: "Harder problems" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", tier: "moderate", hint: "OpenAI accuracy" },
  { id: "openai/gpt-5", label: "GPT-5", tier: "expensive", hint: "Best · slowest · pricey" },
];

export const DEFAULT_ADVISOR_MODEL = "google/gemini-3-flash-preview";
export const ADVISOR_MODEL_IDS = new Set(ADVISOR_MODELS.map((m) => m.id));
