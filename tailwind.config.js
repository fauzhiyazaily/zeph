/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: "var(--color-slate-50)",
          100: "var(--color-slate-100)",
          200: "var(--color-slate-200)",
          300: "var(--color-slate-300)",
          400: "var(--color-slate-400)",
          500: "var(--color-slate-500)",
          600: "var(--color-slate-600)",
          800: "var(--color-slate-800)",
          900: "var(--color-slate-900)",
          950: "var(--color-slate-950)",
        },
        cyan: {
          100: "var(--color-cyan-100)",
          200: "var(--color-cyan-200)",
        },
        blue: {
          500: "var(--color-blue-500)",
        },
        emerald: {
          50: "var(--color-emerald-50)",
          100: "var(--color-emerald-100)",
          300: "var(--color-emerald-300)",
          500: "var(--color-emerald-500)",
          950: "var(--color-emerald-950)",
        },
        amber: {
          100: "var(--color-amber-100)",
          300: "var(--color-amber-300)",
          500: "var(--color-amber-500)",
          950: "var(--color-amber-950)",
        },
        orange: {
          300: "var(--color-orange-300)",
          500: "var(--color-orange-500)",
        },
        teal: {
          300: "var(--color-teal-300)",
        },
        indigo: {
          300: "var(--color-indigo-300)",
          500: "var(--color-indigo-500)",
        },
        white: "#ffffff",
      },
    },
  },
  plugins: [],
};
