import { SidebarProvider } from "@/components/ui/sidebar";
import { DocsSidebar } from "./_components/docs-sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <SidebarProvider className="container min-h-min px-0">
        <DocsSidebar />
        <main className="size-full">{children}</main>
      </SidebarProvider>
    </div>
  );
}
