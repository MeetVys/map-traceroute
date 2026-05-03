import { themes, useThemeController, type ThemeId } from "./theme";

export function ThemePicker() {
  const { theme, setThemeId } = useThemeController();
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      <span>Theme</span>
      <select
        aria-label="Theme"
        value={theme.id}
        onChange={(e) => setThemeId(e.target.value as ThemeId)}
        style={{
          background: "var(--panel)",
          color: "var(--text)",
          border: "1px solid var(--panel-border)",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 12,
        }}
      >
        {Object.values(themes).map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
