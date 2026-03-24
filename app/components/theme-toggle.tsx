import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSettings, type Theme } from "~/lib/settings";

const themeOrder: Theme[] = ["system", "light", "dark"];

function nextTheme(current: Theme): Theme {
  const idx = themeOrder.indexOf(current);
  return themeOrder[(idx + 1) % themeOrder.length];
}

function ThemeIcon({ theme }: { theme: Theme }) {
  switch (theme) {
    case "light":
      return <Sun className="size-4" />;
    case "dark":
      return <Moon className="size-4" />;
    case "system":
      return <Monitor className="size-4" />;
  }
}

export function ThemeToggle() {
  const [settings, updateSettings] = useSettings();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => updateSettings({ theme: nextTheme(settings.theme) })}
      aria-label={`Theme: ${settings.theme}. Click to change.`}
    >
      <ThemeIcon theme={settings.theme} />
    </Button>
  );
}
