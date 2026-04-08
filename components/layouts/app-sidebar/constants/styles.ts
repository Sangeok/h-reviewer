export const SIDEBAR_STYLES = {
  container: {
    collapsed: "w-20",
    expanded: "w-64",
    base: "relative h-screen border-r border-border bg-gradient-to-b from-sidebar to-black backdrop-blur-xl transition-all duration-300",
  },
  button: {
    base: "rounded-lg px-3 py-3 transition-all duration-300",
    active:
      "bg-gradient-to-r from-ring/20 to-primary-muted/10 text-primary border border-ring/30",
    hover: "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
    logout: "text-muted-foreground hover:bg-destructive-bg hover:text-destructive",
  },
  gradient: {
    primary: "from-secondary to-sidebar",
    glow: "from-ring/10 to-transparent",
    logo: "from-secondary to-sidebar",
  },
  animation: {
    shimmer:
      "absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-ring/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none",
    float: "animate-float",
    floatDelayed: "animate-float-delayed",
  },
} as const;
