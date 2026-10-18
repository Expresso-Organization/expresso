import { ArrowUpRight, Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$0",
    cadence: "/month",
    description:
      "For personal projects and early ideas that need a polished place to begin.",
    features: [
      "Up to 3 active projects",
      "Core analytics",
      "Community support",
      "Unlimited collaborators",
    ],
    hoverNote: "Start building. No card needed.",
  },
  {
    name: "Studio",
    price: "$29",
    cadence: "/month",
    description:
      "For small teams shipping client work and growing products every week.",
    features: [
      "Unlimited active projects",
      "Advanced analytics",
      "Priority email support",
      "Custom domains",
    ],
    hoverNote: "Everything your team needs to move.",
    highlighted: true,
  },
  {
    name: "Scale",
    price: "$99",
    cadence: "/month",
    description:
      "For established teams that need more control, support, and room to grow.",
    features: [
      "Everything in Studio",
      "Single sign-on",
      "Dedicated onboarding",
      "Custom usage limits",
    ],
    hoverNote: "More control, without more complexity.",
  },
];

export default function Pricing01() {
  return (
    <section className="bg-background px-4 py-20 text-foreground sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Pricing
            </p>
            <h2 className="mt-3 max-w-md text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-4xl">
              A plan for every stage.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground md:col-span-5 md:col-start-8">
            Start for free, then move up when your work needs more room. Every
            plan includes the essentials to ship something great.
          </p>
        </div>

        <div className="mt-10 grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => (
            <a
              key={plan.name}
              href="#"
              className="group relative block min-h-full pt-10"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-2 z-0 rounded-[1.35rem] bg-white/45 opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.05),inset_0_18px_40px_-30px_rgba(0,0,0,0.28),inset_0_-18px_40px_-32px_rgba(0,0,0,0.24)] backdrop-blur-xl [transform:translate3d(0,14px,0)] transition-[opacity,transform] duration-150 ease-in will-change-[opacity,transform] group-hover:opacity-100 group-hover:[transform:translate3d(0,0,0)] group-hover:duration-500 group-hover:ease-out-strong motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:will-change-auto dark:bg-white/[0.055] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),inset_0_18px_40px_-30px_rgba(255,255,255,0.2),inset_0_-18px_40px_-32px_rgba(255,255,255,0.16)]">
                <p className="px-4 pt-3 text-center text-sm font-medium text-zinc-700 dark:text-zinc-100">
                  {plan.hoverNote}
                </p>
              </div>

              <div
                className={`relative z-10 flex min-h-[390px] flex-col overflow-hidden rounded-[1.35rem] bg-white p-5 text-left shadow-[0_0_0_1px_rgba(0,0,0,0.06),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)] [transform:translate3d(0,0,0)] transition-[background-color,box-shadow,transform] duration-500 ease-out-strong will-change-transform group-hover:[transform:translate3d(0,-4px,0)] group-hover:bg-white group-hover:shadow-[0_0_0_1px_rgba(0,0,0,0.075),0_22px_60px_-42px_rgba(0,0,0,0.65),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)] motion-reduce:transform-none motion-reduce:transition-colors motion-reduce:will-change-auto dark:bg-[#1a1a1a] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.085),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)] dark:group-hover:bg-[#1a1a1a] dark:group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.105),0_22px_60px_-42px_rgba(0,0,0,0.9),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)] sm:p-6 ${
                  plan.highlighted
                    ? "shadow-[0_0_0_1px_rgba(0,0,0,0.085),0_18px_50px_-44px_rgba(0,0,0,0.65),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.115),0_18px_50px_-44px_rgba(0,0,0,0.95),inset_0_8px_18px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent),inset_0_-8px_18px_-22px_color-mix(in_oklch,var(--foreground)_40%,transparent)]"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-normal text-muted-foreground">
                      {plan.name}
                    </p>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-[clamp(2.55rem,13vw,3rem)] font-medium leading-none tracking-[-0.06em] sm:text-5xl">
                        {plan.price}
                      </span>
                      <span className="pb-1 text-sm text-muted-foreground">
                        {plan.cadence}
                      </span>
                    </div>
                  </div>

                  {plan.highlighted && (
                    <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-background shadow-[0_1px_1px_rgba(0,0,0,0.1),0_8px_20px_-12px_rgba(0,0,0,0.45)]">
                      Popular
                    </span>
                  )}
                </div>

                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="mt-8 space-y-3 pb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-medium text-background transition-opacity duration-300 ease-out group-hover:opacity-90">
                  Choose {plan.name}
                  <ArrowUpRight className="size-3.5 [transform:translate3d(0,0,0)] transition-transform duration-300 ease-out group-hover:[transform:translate3d(2px,-2px,0)]" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
