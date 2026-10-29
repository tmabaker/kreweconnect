import type { ReactNode } from "react";
import { FluentProvider, webDarkTheme, type Theme } from "@fluentui/react-components";

/**
 * Data-dense pages (KreweReview) use 10px body type (the rest of the app uses
 * 14px) so more agreements fit on screen. Everything inside, Fluent
 * components included, picks the sizes up from these tokens.
 */
const compactTheme: Theme = {
  ...webDarkTheme,
  fontSizeBase100: "8px",
  fontSizeBase200: "9px",
  fontSizeBase300: "10px",
  fontSizeBase400: "12px",
  fontSizeBase500: "14px",
  fontSizeBase600: "16px",
  fontSizeHero700: "20px",
  fontSizeHero800: "24px",
  fontSizeHero900: "28px",
  lineHeightBase100: "10px",
  lineHeightBase200: "12px",
  lineHeightBase300: "14px",
  lineHeightBase400: "16px",
  lineHeightBase500: "18px",
  lineHeightBase600: "22px",
  lineHeightHero700: "26px",
  lineHeightHero800: "30px",
  lineHeightHero900: "36px",
};

export function CompactArea({ children }: { children: ReactNode }) {
  // Transparent so the app shell's page background still shows through.
  return (
    <FluentProvider theme={compactTheme} style={{ backgroundColor: "transparent", minHeight: "100%" }}>
      {children}
    </FluentProvider>
  );
}
