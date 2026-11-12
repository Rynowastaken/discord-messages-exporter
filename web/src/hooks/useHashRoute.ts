import { useEffect, useState } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "export" }
  | { name: "explorer" }
  | { name: "messages"; exportId: string; query?: string }
  | { name: "insights"; exportId: string };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const query = new URLSearchParams(queryPart);
  const initialQuery = query.get("q") ?? undefined;
  if (!parts.length) return { name: "dashboard" };
  if (parts[0] === "export" && parts.length === 1) {
    return { name: "export" };
  }
  if (parts[0] === "explorer") {
    if (parts.length === 1) return { name: "explorer" };
    if (parts.length === 2 || parts[2] === "messages") {
      return {
        name: "messages",
        exportId: parts[1],
        query: initialQuery,
      };
    }
    if (parts[2] === "insights") {
      return { name: "insights", exportId: parts[1] };
    }
  }
  return { name: "dashboard" };
}

export function navigate(path: string): void {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash)
  );
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/");
    }
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
