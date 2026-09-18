import { useState, type FormEvent } from "react";

import { trackPopiaRequestSchema, type PopiaRequestTracking } from "@voltedge/popia-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@voltedge/ui";
import { safeParse } from "valibot";

import {
  ApiError,
  RequestFile,
  fieldErrors,
  trackPopiaRequest,
  type FieldErrors,
} from "@voltedge/popia-ui";

export function TrackView() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tracked, setTracked] = useState<PopiaRequestTracking | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = safeParse(trackPopiaRequestSchema, { reference, email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.issues));
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const result = await trackPopiaRequest(parsed.output);
      setTracked(result.request);
      setReference(result.request.reference);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setErrors(fieldErrors(caught.issues));
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14 lg:py-16">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-muted-foreground">tracking</span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            Follow your request.
          </h1>
          <p className="max-w-[48ch] leading-relaxed text-muted-foreground">
            Enter the reference we gave you and the email address you submitted with. Only the two
            together unlock the request.
          </p>
          <a
            href="/popia"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Need to submit a new request?
          </a>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Find a request</CardTitle>
            <CardDescription>Both fields are required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
              <Field data-invalid={Boolean(errors.reference)}>
                <FieldLabel htmlFor="reference">Reference</FieldLabel>
                <Input
                  id="reference"
                  value={reference}
                  placeholder="POPIA-2026-XXXXXX"
                  className="font-mono uppercase"
                  aria-invalid={Boolean(errors.reference)}
                  onChange={(event) => setReference(event.target.value)}
                />
                <FieldError>{errors.reference}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="track-email">Email</FieldLabel>
                <Input
                  id="track-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <FieldError>{errors.email}</FieldError>
              </Field>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>No request found</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Looking…" : "Track request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {tracked ? (
          <>
            <span className="font-mono text-xs text-muted-foreground">case file</span>
            <RequestFile request={tracked} events={tracked.events} />
          </>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-border px-6 py-20 text-center">
            <p className="max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
              Your request and its timeline will appear here once you enter the correct reference
              and email.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
