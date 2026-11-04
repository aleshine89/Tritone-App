import { getRequest } from "@tanstack/react-start/server";

export function ipRichiesta(): string {
  try {
    const request = getRequest();
    if (!request) return "non disponibile";
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const primo = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
    if (/^[0-9a-fA-F:.]+$/.test(primo) && primo.length <= 64) return primo;
    return "non disponibile";
  } catch {
    return "non disponibile";
  }
}
