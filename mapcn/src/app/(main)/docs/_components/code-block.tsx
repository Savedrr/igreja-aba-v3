import { highlightCode } from "@/lib/highlight";
import { CopyButton } from "./copy-button";

interface CodeBlockProps {
  code: string;
  language?: string;
  showCopyButton?: boolean;
}

export async function CodeBlock({
  code,
  language = "tsx",
  showCopyButton = true,
}: CodeBlockProps) {
  const highlighted = await highlightCode(code, language);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border">
      {showCopyButton && (
        <div className="absolute top-2 right-2 z-10">
          <CopyButton text={code} />
        </div>
      )}
      <div
        className="bg-muted/40 overflow-auto p-4 text-sm [&_code]:bg-transparent! [&_pre]:bg-transparent!"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
