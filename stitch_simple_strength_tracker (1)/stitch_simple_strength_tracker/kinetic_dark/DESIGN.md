---
name: Kinetic Dark
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b90a0'
  outline-variant: '#414755'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e69'
  primary-container: '#4b8eff'
  on-primary-container: '#00285c'
  inverse-primary: '#005bc1'
  secondary: '#4ae176'
  on-secondary: '#003915'
  secondary-container: '#00b954'
  on-secondary-container: '#004119'
  tertiary: '#eec200'
  on-tertiary: '#3c2f00'
  tertiary-container: '#cea700'
  on-tertiary-container: '#4e3e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#6bff8f'
  secondary-fixed-dim: '#4ae176'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005321'
  tertiary-fixed: '#ffe083'
  tertiary-fixed-dim: '#eec200'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#574500'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  stat-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  touch-target: 48px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

The design system is engineered for high-performance fitness environments, prioritizing immediate legibility and effortless interaction during physical activity. The brand personality is disciplined, energetic, and precise. 

The aesthetic leverages **High-Contrast Minimalism** set against a deep, immersive background. This reduces eye strain in low-light gym settings while allowing "Electric Blue" accents to command attention for critical data points and primary actions. Elements are designed with a **Tactile** philosophy—using subtle tonal shifts and generous sizing to ensure every interactive surface feels reachable and responsive, even with sweat-slicked hands or during high-intensity movement.

## Colors

This design system utilizes a "True Dark" foundation to maximize contrast and power efficiency on OLED displays. 

- **Primary (Electric Blue):** Used exclusively for high-priority actions, active toggle states, and progress indicators.
- **Secondary (Performance Green):** Reserved for "Success" states, completed sets, and "Go" buttons.
- **Tertiary (Warning Gold):** Used for personal record alerts and rest-timer warnings.
- **Neutral Palette:** The background uses a deep charcoal (#121212) rather than pure black to maintain soft depth. Text scales from High-Emphasis White (#FFFFFF) to Medium-Emphasis Gray (#A1A1AA).

## Typography

The typography system uses **Inter** for its exceptional legibility and neutral, athletic character. 

- **Numerical Data:** For weights, reps, and timers, use the `stat-xl` or `display-lg` styles. These feature tighter letter spacing and heavy weights to remain readable at a distance.
- **Hierarchy:** Use High-Emphasis White for headlines and primary stats. Use Medium-Emphasis Gray for secondary labels and metadata. 
- **Readability:** Line heights are slightly increased for body text to ensure instructions are easy to parse while breathing heavily.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for thumb-reachability.

- **The 8px Rhythm:** All spacing and component heights must be multiples of 4px, with 8px being the preferred base increment.
- **Touch Zones:** All interactive elements must adhere to a minimum 48x48px touch target. For critical workout actions (Start/Stop), targets should exceed 64px in height.
- **Safe Areas:** Maintain a 20px side margin on mobile to prevent accidental triggers near the screen edge.
- **Information Density:** Use generous vertical spacing (`xl`) between distinct exercise blocks to prevent visual clutter during rapid scrolling.

## Elevation & Depth

This design system uses **Tonal Layering** instead of heavy shadows to maintain a clean, high-contrast look.

- **Level 0 (Background):** #121212. Used for the main app canvas.
- **Level 1 (Surface):** #1E1E1E. Used for cards and grouped content.
- **Level 2 (Overlay):** #2C2C2C. Used for modals and active input fields.
- **Physicality:** To create a tactile feel, use a 1px solid border (#3F3F46) on Level 1 surfaces. This creates a "bezel" effect that makes cards feel like physical modules. No blurs or gradients are used, keeping the interface sharp and performant.

## Shapes

The shape language is **Rounded**, striking a balance between the aggressive nature of fitness and the approachability of a health tool.

- **Standard Elements:** Buttons and cards use a 0.5rem (8px) radius.
- **Large Containers:** Workout summaries and main dash cards use `rounded-lg` (16px).
- **Interactive Pills:** Small tags or category chips use a full pill shape for instant differentiation from primary action buttons.

## Components

- **Primary Buttons:** High-contrast Electric Blue backgrounds with white text. Minimum height 56px. Text must be `label-md` and all-caps for urgency.
- **Workout Cards:** Level 1 surfaces with a 1px border. Feature a left-aligned "Electric Blue" accent bar to indicate the current active exercise.
- **Input Fields:** Large, blocky fields with #1E1E1E backgrounds. On focus, the border transitions to 2px solid Electric Blue.
- **Progress Rings:** Use a 12px stroke width. The "Electric Blue" represents current progress, while a #2C2C2C track represents the remaining goal.
- **Steppers:** Large "+" and "-" hit areas (minimum 56x56px) flanking a central numeric value for easy weight/rep adjustments.
- **Chips:** Used for muscle group tags (e.g., "Chest", "Quads"). Transparent backgrounds with a light-gray border, filling with Electric Blue only when filtered/selected.