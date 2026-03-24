import { useEffect } from "react";
import { useSettings, resolveTheme } from "~/lib/settings";

export function ThemeEffect() {
  const [settings] = useSettings();

  // Apply theme class to <html> whenever settings change
  useEffect(() => {
    const resolved = resolveTheme(settings.theme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [settings.theme]);

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  return null;
}

