export interface Citation {
  source: string;
  chunkId: number;
}

const CITATION_PATTERN = /\[([^\]\n]+?)#(\d+)\]/g;
const CITATION_PREFIX = "#citation:";

/**
 * Turn `[source#chunk]` references into markdown links so the renderer can make
 * them interactive. Code spans and fenced blocks are left untouched.
 */
export function linkifyCitations(text: string): string {
  if (!text.includes("#")) return text;

  return text
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(
        CITATION_PATTERN,
        (_match, source: string, chunk: string) =>
          `[${source}#${chunk}](${CITATION_PREFIX}${encodeURIComponent(source)}#${chunk})`,
      );
    })
    .join("");
}

export function parseCitationHref(href: string): Citation | null {
  if (!href.startsWith(CITATION_PREFIX)) return null;
  const value = decodeURIComponent(href.slice(CITATION_PREFIX.length));
  const separator = value.lastIndexOf("#");
  if (separator === -1) return null;

  const source = value.slice(0, separator);
  const chunkId = Number(value.slice(separator + 1));
  if (!source || !Number.isFinite(chunkId)) return null;

  return { source, chunkId };
}
