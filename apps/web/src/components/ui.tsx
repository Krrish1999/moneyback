import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-brand px-5 text-base font-semibold text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70";
const secondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-brand bg-card px-5 text-base font-semibold text-brand hover:bg-brand-soft";

export function PrimaryButton({ className = "", ...props }: ComponentProps<"button">) {
  return <button className={`${primary} ${className}`} {...props} />;
}

export function PrimaryLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${primary} ${className}`} {...props} />;
}

export function SecondaryLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${secondary} ${className}`} {...props} />;
}

export function PageHeading({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold leading-snug text-ink">{children}</h1>;
}
