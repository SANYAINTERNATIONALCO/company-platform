// TS mirror of app/tokens.css — for the rare case a primitive needs a real
// number (not a CSS var string), e.g. multiplying a signature-scale factor.
// Components should reference the CSS custom properties directly in
// style={{}} objects wherever possible; only import this for numeric math.
// See DESIGN_TOKENS.md for the full spec these values come from.

export const tokens = {
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, full: 999 },
  duration: { instant: 100, fast: 150, base: 200, slow: 320, slower: 450 },
  breakpoint: { sm: 640, md: 768, lg: 1024, xl: 1280 },
  zIndex: { base: 0, sticky: 10, dropdown: 20, overlay: 30, modal: 40, toast: 50, tooltip: 60 },
} as const
