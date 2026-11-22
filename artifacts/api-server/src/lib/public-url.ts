import { getWorkRateEnvironment } from "./runtime-environment";

export function getWorkRatePublicUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const explicit = environment["WORKRATE_PUBLIC_URL"]?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  if (getWorkRateEnvironment(environment) === "development") {
    const replitHost = environment["REPLIT_DOMAINS"]?.split(",")[0]?.trim()
      || environment["REPLIT_DEV_DOMAIN"]?.trim();
    if (replitHost) return `https://${replitHost}`;
    return "http://localhost:8080";
  }

  throw new Error("WORKRATE_PUBLIC_URL is required outside development.");
}
