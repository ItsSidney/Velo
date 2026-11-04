module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { base: "#0A0A0A", surface: "#111111", elevated: "#171717", hover: "#1F1F1F", active: "#262626" },
        border: { subtle: "#1F1F1F", default: "#2A2A2A", strong: "#3A3A3A" },
        text: { primary: "#EDEDED", secondary: "#A1A1A1", muted: "#6B6B6B" },
        accent: "#FFFFFF"
      }
    }
  },
  plugins: []
};