import Link from "next/link";
import { CSSProperties } from "react";

import { ExamplesGrid } from "./_components/examples-grid";
import { Footer } from "@/components/footer";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
  PageActions,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <>
      <PageHeader>
        <PageHeaderHeading>Beautiful maps, made simple</PageHeaderHeading>
        <PageHeaderDescription>
          Ready to use, customizable map components for React.
          <br className="hidden sm:block" />
          Built on MapLibre. Styled with Tailwind.
        </PageHeaderDescription>
        <PageActions>
          <Button size="lg" asChild>
            <Link href="/docs">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/docs/basic-map">View Components</Link>
          </Button>
        </PageActions>
      </PageHeader>

      <section
        className="animate-fade-in animate-stagger container-wide pt-4"
        style={
          {
            "--stagger": 4,
          } as CSSProperties
        }
      >
        <ExamplesGrid />
      </section>

      <Footer />
    </>
  );
}
