import { randomBytes } from "node:crypto";
import type { DynamicFieldType } from "./platform.types";

export function countWords(input: string): number {
  const tokens = input.trim().match(/\S+/g);
  return tokens?.length ?? 0;
}

export function generateShortId(length = 6): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

export function normalizeFieldType(type: string | undefined): DynamicFieldType {
  if (type === "number") return "number";
  if (type === "option" || type === "select") return "option";
  return "text";
}

export function parseAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && "name" in entry) {
      const name = (entry as { name?: unknown }).name;
      return typeof name === "string" ? [name] : [];
    }
    return [];
  });
}
