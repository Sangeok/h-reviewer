import type { UserAvatarProps } from "../../types";

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function UserAvatar({
  user,
  size = "md",
  showBorder = true,
  className = "",
}: UserAvatarProps) {
  const borderClass = showBorder
    ? "border-2 border-ring/30 ring-2 ring-ring/10"
    : "";

  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name || "User"}
        className={`${sizeClasses[size]} rounded-full ${borderClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-secondary to-sidebar border border-ring/30 flex items-center justify-center ${className}`}
    >
      <span className="text-primary font-medium">
        {user.name?.charAt(0) || "U"}
      </span>
    </div>
  );
}
