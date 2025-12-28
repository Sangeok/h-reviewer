export const SIDEBAR_STYLES = {
  container: {
    collapsed: "w-20",
    expanded: "w-64",
    base: "relative h-screen border-r border-gray-800 bg-[#12121a]/90 backdrop-blur-xl transition-all duration-300",
  },
  button: {
    base: "rounded-xl px-3 py-3 transition-all duration-200",
    active:
      "bg-gradient-to-r from-cyan-500/10 to-blue-600/10 text-cyan-400 shadow-lg shadow-cyan-500/5",
    hover: "text-gray-400 hover:bg-white/5 hover:text-white",
    logout: "text-gray-400 hover:bg-red-500/10 hover:text-red-400",
  },
  gradient: {
    primary: "from-cyan-400 to-blue-600",
    glow: "from-cyan-500/20 to-blue-600/20",
    logo: "from-cyan-400 to-blue-600",
  },
  animation: {
    shimmer:
      "absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none",
    float: "animate-float",
    floatDelayed: "animate-float-delayed",
  },
} as const;
