export const SIDEBAR_STYLES = {
  container: {
    collapsed: "w-20",
    expanded: "w-64",
    base: "relative h-screen border-r border-[#1a1a1a] bg-gradient-to-b from-[#0a0a0a] to-black backdrop-blur-xl transition-all duration-300",
  },
  button: {
    base: "rounded-lg px-3 py-3 transition-all duration-300",
    active:
      "bg-gradient-to-r from-[#2d3e2d]/20 to-[#3d523d]/10 text-[#4a6a4a] border border-[#2d3e2d]/30",
    hover: "text-[#707070] hover:bg-[#1a1a1a] hover:text-[#d0d0d0]",
    logout: "text-[#707070] hover:bg-[#3a1a1a] hover:text-[#ff6b6b]",
  },
  gradient: {
    primary: "from-[#1a1a1a] to-[#0a0a0a]",
    glow: "from-[#2d3e2d]/10 to-transparent",
    logo: "from-[#1a1a1a] to-[#0a0a0a]",
  },
  animation: {
    shimmer:
      "absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-[#2d3e2d]/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none",
    float: "animate-float",
    floatDelayed: "animate-float-delayed",
  },
} as const;
