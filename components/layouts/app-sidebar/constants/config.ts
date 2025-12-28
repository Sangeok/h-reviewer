export const SIDEBAR_CONFIG = {
  width: {
    collapsed: 80,
    expanded: 256,
  },
  transition: {
    duration: 300,
  },
  version: "v1.0.0",
  year: new Date().getFullYear(),
} as const;

export const ANIMATION_CONFIG = {
  duration: {
    fast: 200,
    normal: 300,
    slow: 700,
  },
  blur: {
    small: 60,
    large: 80,
  },
  gradient: {
    size: {
      small: 250,
      large: 300,
    },
  },
} as const;

export const THEME_CONFIG = {
  storageKey: "sidebar-collapsed",
  toggle: {
    size: {
      width: 40,
      height: 20,
      indicator: 16,
    },
  },
} as const;
