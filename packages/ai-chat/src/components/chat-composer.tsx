import { useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { Button, Spinner, Textarea } from "@voltedge/ui";
import type { ChatStatus } from "@voltedge/agent-contract";

export function ChatComposer({
  status,
  onSubmit,
}: {
  status: ChatStatus;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    onSubmit(text);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 pl-4 shadow-sm transition-colors focus-within:border-ring"
    >
      <Textarea
        id="message"
        name="message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        aria-label="Message"
        placeholder="Ask about South African statistics…"
        className="min-h-10 resize-none border-0 bg-transparent px-0 py-2.5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="submit"
        size="icon"
        disabled={busy || !value.trim()}
        aria-label={busy ? "Generating" : "Send"}
        className="rounded-full"
      >
        {busy ? <Spinner /> : <ArrowUpIcon />}
      </Button>
    </form>
  );
}
