import {
  PageActions,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Metadata } from "next";
import { getAllBlocks } from "@/lib/blocks";
import { BlockDisplay } from "./_components/block-display";
import { type CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Map blocks for your application",
  description:
    "Pre-built, ready-to-use map blocks. Browse, preview, and copy them into your app with one command.",
};

export default async function Page() {
  const blocks = getAllBlocks();

  return (
    <>
      <PageHeader align="left" showBackground={false}>
        <PageHeaderHeading className="font-semibold md:text-5xl">
          Map blocks for your application
        </PageHeaderHeading>
        <PageHeaderDescription className="md:text-lg">
          Pre-built, ready-to-use map blocks. Browse, preview, and copy them
          into your app with one command.
        </PageHeaderDescription>
        <PageActions>
          <Button asChild>
            <a href="#blocks">Browse Blocks</a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/docs">View Documentation</Link>
          </Button>
        </PageActions>
      </PageHeader>

      <section
        className="animate-fade-up animate-stagger container scroll-mt-20 space-y-20"
        id="blocks"
        style={
          {
            "--stagger": 4,
          } as CSSProperties
        }
      >
        {blocks.map((block) => (
          <BlockDisplay key={block.name} name={block.name} />
        ))}
      </section>

      <Footer />
    </>
  );
}
