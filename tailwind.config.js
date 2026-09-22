/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./odyssa_nail_salon_management_system.html'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#fdf8f8', 100: '#f9eeef', 200: '#f2d8dc', 300: '#e5b6be',
                    400: '#d08695', 500: '#ba5c6f', 600: '#9d3b4f', 700: '#7e2437',
                    800: '#641626', 900: '#460c18', 950: '#2b050d'
                },
                borravino: { light: '#8b263b', DEFAULT: '#641626', dark: '#3d0813' },
                cream: {
                    50: '#fdfbf7', 100: '#f7f2ea', 200: '#ede4d4', 300: '#ded0bc',
                    400: '#c8b499', 500: '#ab9577'
                },
                roseGold: { light: '#fbf4dd', DEFAULT: '#c79f37', dark: '#835f1e' },
                blush: { 50: '#fdfbf7', 100: '#f7f2ea', 200: '#ede4d4', 300: '#ded0bc' },
                greekGold: {
                    100: '#fbf4dd', 200: '#f6e7b5', 300: '#ebd385', 400: '#dcbb59',
                    500: '#c79f37', 600: '#a77f28', 700: '#835f1e', 800: '#64471a'
                },
                slateDark: '#261216'
            },
            fontFamily: {
                cinzel: ['Cinzel', 'serif'],
                serif: ['Cinzel', 'Playfair Display', 'serif'],
                sans: ['Plus Jakarta Sans', 'sans-serif']
            }
        }
    }
};
