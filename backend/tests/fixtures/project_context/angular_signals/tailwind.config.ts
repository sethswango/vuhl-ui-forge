import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        primary: "#2E7D32",
        accent: "#1565C0"
      },
      spacing: {
        gutter: "1.5rem"
      }
    }
  }
} satisfies Config;
