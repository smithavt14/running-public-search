/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'title': ['"Helvetica Neue Condensed Bold"', 'Arial', 'sans-serif'],
        'body': ['Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        background: {
          light: '#ffffff',
          dark: '#09090b',
        },
        foreground: {
          light: '#1c1b1b',
          dark: '#f4f4f5',
        },
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"],
  },
}

