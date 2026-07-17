import { LOGIN_STRINGS } from "../../constants";

export default function LoginFooter() {
  return (
    <div className="mt-12 text-center">
      <p className="text-xs font-light text-muted-foreground/60">
        {LOGIN_STRINGS.noAccountMessage}{" "}
        <a
          href="#"
          className="underline decoration-border underline-offset-2 transition-colors duration-300 hover:text-primary hover:decoration-primary"
        >
          {LOGIN_STRINGS.termsOfService}
        </a>{" "}
        and{" "}
        <a
          href="#"
          className="underline decoration-border underline-offset-2 transition-colors duration-300 hover:text-primary hover:decoration-primary"
        >
          {LOGIN_STRINGS.privacyPolicy}
        </a>
      </p>
    </div>
  );
}
