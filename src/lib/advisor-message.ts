import type { AdvisorMessage } from "@/lib/advisor-types";

export function advisorMessageText(message: AdvisorMessage) {
  return message.parts.map((part: any) => (part.type === "text" ? part.text : "")).join("");
}
