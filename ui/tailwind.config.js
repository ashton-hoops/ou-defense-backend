/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#121212',
        surface: '#181818',
        outline: '#1f1f1f',
        accent: '#841617',
      },
    },
  },
  plugins: [],
}
