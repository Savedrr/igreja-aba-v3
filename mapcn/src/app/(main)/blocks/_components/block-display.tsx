import { getAllBlocks, createFileTreeForRegistryItemFiles } from "@/lib/blocks";
import { getBlockFileSource } from "@/lib/get-block-file-source";
import { highlightCode } from "@/lib/highlight";
import { BlockPreview } from "./block-preview";
import { IframePreview } from "./iframe-preview";

interface BlockDisplayProps {
  name: string;
}

export async function BlockDisplay({ name }: BlockDisplayProps) {
  const blocks = getAllBlocks();
  const block = blocks.find((b) => b.name === name);

  if (!block || !block.files?.length) {
    return null;
  }

  const tree = createFileTreeForRegistryItemFiles(block.files);

  const highlightedFiles = await Promise.all(
    block.files.map(async (file) => {
      const content = getBlockFileSource(file.path);
      const lang = file.path.split(".").pop() ?? "tsx";
      const highlightedContent = await highlightCode(content, lang);
      return {
        path: file.path,
        target: file.target ?? file.path,
        content,
        highlightedContent,
      };
    })
  );

  return (
    <BlockPreview block={block} tree={tree} highlightedFiles={highlightedFiles}>
      <IframePreview src={`/view/${block.name}`} title={block.title ?? block.name} />
    </BlockPreview>
  );
}
