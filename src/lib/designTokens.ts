/**
 * CLIPPER — CINEMATIC CREATIVE STUDIO DESIGN TOKENS
 * 
 * Centralized graphite/silver design tokens:
 * - Soft Black, Graphite, Dark Grey, Silver, Off-White
 * - Reflected light metallic highlights
 * - High-contrast editorial typography and restrained single-level depth
 */

export const colors = {
  // Backgrounds & Canvas (Extremely dark, graphite-tinted, near-black)
  bg: {
    dominant: '#080909',   // Dominant background
    primary: '#0B0C0D',    // Primary application background
    secondary: '#101112',  // Secondary background
  },
  
  // Surfaces & Depth Hierarchy (Monochromatic graphite continuum)
  surface: {
    elevated: '#141516',   // Base elevated surface
    card: '#171819',       // Standard card surface
    cardElevated: '#1B1C1E', // Elevated card / active item surface
    hover: '#202123',      // Hover surface
    active: '#252628',     // Active / selected surface
    sunken: '#080909',     // Inset / timeline trough / inputs
  },

  // Borders & Dividers
  border: {
    subtle: 'rgba(199, 201, 204, 0.10)',
    default: '#292B2D',
    strong: '#3A3C3F',
    hover: 'rgba(199, 201, 204, 0.22)',
    silver: '#686B70',
    bright: '#C7C9CC',
  },

  // Silver Accent System (Selective metallic highlights)
  silver: {
    subtle: '#686B70',
    medium: '#92969C',
    bright: '#C7C9CC',
    pure: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #C7C9CC 42%, #777A7E 100%)',
    gradientSubtle: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(199,201,204,0.03) 100%)',
  },

  // Text & Typography
  text: {
    primary: '#F2F2F0',    // Off-white primary headings and text
    secondary: '#B4B6B9',  // Secondary descriptive text
    muted: '#777A7E',      // Muted metadata and timestamps
    disabled: '#4E5053',   // Disabled controls
    highlight: '#FFFFFF',  // Pure white emphasis
    inverse: '#0B0C0D',    // Dark text on bright silver buttons
  },

  // Primary Accent (Silver, replacing purple/indigo)
  accent: {
    DEFAULT: '#C7C9CC',
    hover: '#FFFFFF',
    active: '#92969C',
    glow: 'rgba(199, 201, 204, 0.20)',
    subtle: 'rgba(199, 201, 204, 0.08)',
  },

  // Semantic Signals (Monochromatic restraint, subdued alerts)
  semantic: {
    success: '#10B981',
    successSubtle: 'rgba(16, 185, 129, 0.15)',
    warning: '#F59E0B',
    warningSubtle: 'rgba(245, 158, 11, 0.15)',
    error: '#EF4444',
    errorSubtle: 'rgba(239, 68, 68, 0.15)',
    info: '#92969C',
    infoSubtle: 'rgba(146, 150, 156, 0.15)',
  },
} as const;

export const elevation = {
  level0: 'none',
  level1: '0 1px 2px 0 rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(199, 201, 204, 0.08)',
  level2: '0 4px 14px -2px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(199, 201, 204, 0.10)',
  level3: '0 12px 28px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(199, 201, 204, 0.12)',
  level4: '0 20px 40px -8px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(199, 201, 204, 0.16)',
  level5: '0 28px 64px -12px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(199, 201, 204, 0.25)',
} as const;

export const radii = {
  none: '0px',
  xs: '4px',    // Micro controls, badge corners
  sm: '6px',    // Buttons, inputs, small tags
  md: '10px',   // Cards, panels, dropdowns (restrained)
  lg: '14px',   // Modals, major surfaces, media windows
  xl: '16px',   // Maximum container radius
  full: '9999px',
} as const;

export const spacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
} as const;

/**
 * 5D Motion Tokens & Physics
 * Specially calibrated timing & spring configs for professional video tools
 */
export const motionTokens = {
  // Duration in seconds for Framer Motion / Motion
  duration: {
    micro: 0.15,       // 150ms — button press, icon swap, tag toggle
    component: 0.25,   // 250ms — dropdowns, popovers, tooltip, hover elevation
    panel: 0.38,       // 380ms — drawer slide, media inspector expand
    spatial: 0.65,     // 650ms — workspace transition, project expansion
    ambient: 12.0,     // 12s — subtle background atmosphere
  },

  // Easing Curves (Cubic Bezier)
  ease: {
    // Professional ease-out for immediate responsive user feedback
    expressiveOut: [0.16, 1, 0.3, 1],
    // Smooth deceleration for spatial surface expansion
    spatial: [0.22, 1, 0.36, 1],
    // Symmetrical in-out for transitions
    inOut: [0.4, 0, 0.2, 1],
    // Sharp snap for micro actions
    snap: [0.05, 0.7, 0.1, 1],
  },

  // Motion physics spring presets
  spring: {
    tactile: { type: 'spring', stiffness: 450, damping: 28 },
    spatial: { type: 'spring', stiffness: 280, damping: 26 },
    gentle: { type: 'spring', stiffness: 180, damping: 22 },
    parallax: { type: 'spring', stiffness: 120, damping: 20 },
  },
} as const;
