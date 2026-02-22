import { LOGIN_ANIMATION, LOGIN_FEATURES } from "../../constants";

export default function LoginFeatures() {
  return (
    <div className="space-y-3.5 border-t border-border pt-8">
      {LOGIN_FEATURES.map((feature, index) => (
        <div
          key={feature.text}
          className="animate-fade-in flex items-center gap-3 text-sm font-light text-muted-foreground opacity-0"
          style={{
            animationDelay: `${index * LOGIN_ANIMATION.featureDelayMs}ms`,
            animationFillMode: "forwards",
          }}
        >
          <span className="text-base opacity-60">{feature.icon}</span>
          <span>{feature.text}</span>
        </div>
      ))}
    </div>
  );
}
