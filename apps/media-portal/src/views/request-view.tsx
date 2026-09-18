import { useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import { safeParse } from "valibot";

import { submitMediaRequestSchema } from "@voltedge/media-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
} from "@voltedge/ui";
import { ApiError, fieldErrors, submitMediaRequest } from "@voltedge/media-ui";

import { navigate } from "../lib/router.ts";

interface FormState {
  fullName: string;
  outlet: string;
  claim: string;
  context: string;
}

const EMPTY: FormState = {
  fullName: "",
  outlet: "",
  claim: "",
  context: "",
};

export function RequestView() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const parsed = safeParse(submitMediaRequestSchema, {
      fullName: form.fullName,
      claim: form.claim,
      context: form.context,
      outlet: form.outlet,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.issues));
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const result = await submitMediaRequest({
        fullName: parsed.output.fullName,
        claim: parsed.output.claim,
        ...(parsed.output.context ? { context: parsed.output.context } : {}),
        ...(parsed.output.outlet ? { outlet: parsed.output.outlet } : {}),
      });
      navigate(`/requests/${result.request.reference}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.issues.length > 0) setErrors(fieldErrors(caught.issues));
        setFailure(caught.issues.length > 0 ? "Check the highlighted fields." : caught.message);
      } else {
        setFailure("Could not submit the request. Try again shortly.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            New fact-check request
          </span>
          <h1 className="font-heading text-3xl font-medium">What should we check?</h1>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Describe the claim, figure or statement you need verified. The clearer the claim, the
            better the sources we can match it to.
          </p>
        </div>

        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          {failure ? (
            <Alert variant="destructive">
              <AlertTitle>Could not submit</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={errors.fullName ? true : undefined}>
              <FieldLabel htmlFor="fullName">Your full name</FieldLabel>
              <Input
                id="fullName"
                value={form.fullName}
                autoComplete="name"
                onChange={(event) => update("fullName", event.target.value)}
              />
              <FieldError>{errors.fullName}</FieldError>
            </Field>

            <Field data-invalid={errors.outlet ? true : undefined}>
              <FieldLabel htmlFor="outlet">Outlet or publication</FieldLabel>
              <Input
                id="outlet"
                value={form.outlet}
                placeholder="Freelance, newsroom, agency…"
                onChange={(event) => update("outlet", event.target.value)}
              />
              <FieldError>{errors.outlet}</FieldError>
            </Field>
          </div>

          <Field data-invalid={errors.claim ? true : undefined}>
            <FieldLabel htmlFor="claim">Claim or question to check</FieldLabel>
            <Textarea
              id="claim"
              rows={4}
              value={form.claim}
              placeholder='e.g. "Is it true that headline inflation fell to 2% in July 2026?"'
              onChange={(event) => update("claim", event.target.value)}
            />
            <FieldDescription>
              Include the exact wording, figure, period and any place names that matter.
            </FieldDescription>
            <FieldError>{errors.claim}</FieldError>
          </Field>

          <Field data-invalid={errors.context ? true : undefined}>
            <FieldLabel htmlFor="context">Context</FieldLabel>
            <Textarea
              id="context"
              rows={3}
              value={form.context}
              placeholder="Where the claim comes from, what angle you are pursuing, related reports…"
              onChange={(event) => update("context", event.target.value)}
            />
            <FieldDescription>Optional, but it helps us find the right release.</FieldDescription>
            <FieldError>{errors.context}</FieldError>
          </Field>

          <Button type="submit" disabled={busy} className="self-start">
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </div>

      <aside className="flex flex-col gap-4 lg:pt-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-4 text-brand" />
              What happens next
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Your request is analysed against approved Stats SA sources and a cited draft is
              prepared for review. If the sources do not cover the claim, the information gap is
              flagged instead.
            </p>
            <p>
              A communications official edits and approves the response before it is released to
              you. You will see each stage on the request page.
            </p>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
