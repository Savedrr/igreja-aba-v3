import Link from "next/link";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const footerLinks = {
  product: [
    { label: "Documentation", href: "/docs" },
    { label: "Components", href: "/docs/basic-map" },
    { label: "Blocks", href: "/blocks" },
  ],
  community: [
    {
      label: "GitHub",
      href: "https://github.com/AnmolSaini16/mapcn",
      external: true,
    },
    {
      label: "Sponsor",
      href: "https://github.com/sponsors/AnmolSaini16",
      external: true,
    },
  ],
  resources: [
    { label: "MapLibre GL", href: "https://maplibre.org/", external: true },
    { label: "shadcn/ui", href: "https://ui.shadcn.com/", external: true },
    {
      label: "Tailwind CSS",
      href: "https://tailwindcss.com/",
      external: true,
    },
  ],
};

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-30 border-t", className)}>
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo className="w-fit" />
            <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed">
              Free & open-source, ready-to-use, customizable map components for
              React.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              Built by{" "}
              <Link
                href="https://x.com/anmol16_"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                @anmol
              </Link>
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2.5">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Community</h3>
            <ul className="space-y-2.5">
              {footerLinks.community.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Resources</h3>
            <ul className="space-y-2.5">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
