/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Manrope'", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)",
      },
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
      },
    },
  },
  plugins: [],
};
