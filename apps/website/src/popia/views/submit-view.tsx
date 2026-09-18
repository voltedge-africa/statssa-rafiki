import { useState, type FormEvent } from "react";

import {
  POPIA_REQUEST_TYPES,
  POPIA_REQUEST_TYPE_DESCRIPTIONS,
  POPIA_REQUEST_TYPE_LABELS,
  POPIA_RESPONSE_WINDOW_DAYS,
  submitPopiaRequestSchema,
  type PopiaRequestPublic,
  type PopiaRequestType,
} from "@voltedge/popia-contract";
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
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
  cn,
} from "@voltedge/ui";
import { safeParse } from "valibot";

import {
  ApiError,
  Fact,
  fieldErrors,
  formatDate,
  submitPopiaRequest,
  type FieldErrors,
} from "@voltedge/popia-ui";

import { useSession } from "../../lib/session.tsx";

const EMPTY_FORM = {
  type: "access" as PopiaRequestType,
  fullName: "",
  email: "",
  phone: "",
  details: "",
  desiredOutcome: "",
};

export function SubmitView() {
  const { session } = useSession();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<PopiaRequestPublic | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = safeParse(submitPopiaRequestSchema, {
      type: form.type,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone.trim() || undefined,
      details: form.details,
      desiredOutcome: form.desiredOutcome.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.issues));
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const result = await submitPopiaRequest(parsed.output);
      setSubmitted(result.request);
      window.scrollTo({ top: 0 });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(fieldErrors(caught.issues));
        setError(caught.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <Submitted
        request={submitted}
        linked={Boolean(session)}
        onSubmitAnother={() => {
          setSubmitted(null);
          setForm(EMPTY_FORM);
        }}
      />
    );
  }

  return (
    <section
      className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:py-16"
      data-reveal
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-muted-foreground">popia request desk</span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Ask us what we hold about you.
          </h1>
          <p className="max-w-[52ch] leading-relaxed text-muted-foreground">
            Use this form to exercise your rights under the Protection of Personal Information Act.
            You do not need an account. We respond within {POPIA_RESPONSE_WINDOW_DAYS} days, and you
            can follow progress with your reference number.
          </p>
        </div>

        <ol className="flex flex-col gap-5 border-t border-border pt-6">
          {POPIA_REQUEST_TYPES.map((type, index) => (
            <li key={type} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{POPIA_REQUEST_TYPE_LABELS[type]}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {POPIA_REQUEST_TYPE_DESCRIPTIONS[type]}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <a
          href="/popia/track"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Already have a reference? Track a request
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your request</CardTitle>
          <CardDescription>
            {session
              ? "Signed in — this request will be linked to your account."
              : "Submitting as a member of the public. We reply to the email you give us."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            <Field data-invalid={Boolean(errors.type)}>
              <FieldLabel>What do you want to do?</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {POPIA_REQUEST_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, type }))}
                    className={cn(
                      "flex flex-col gap-1 border px-3 py-2.5 text-left transition-colors",
                      form.type === type
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="text-sm font-medium">{POPIA_REQUEST_TYPE_LABELS[type]}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {POPIA_REQUEST_TYPE_DESCRIPTIONS[type]}
                    </span>
                  </button>
                ))}
              </div>
              <FieldError>{errors.type}</FieldError>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.fullName)}>
                <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                <Input
                  id="fullName"
                  value={form.fullName}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.fullName)}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
                <FieldError>{errors.fullName}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <FieldError>{errors.email}</FieldError>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
              <Input
                id="phone"
                value={form.phone}
                autoComplete="tel"
                aria-invalid={Boolean(errors.phone)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
              <FieldError>{errors.phone}</FieldError>
            </Field>

            <Field data-invalid={Boolean(errors.details)}>
              <FieldLabel htmlFor="details">What is your request?</FieldLabel>
              <Textarea
                id="details"
                value={form.details}
                rows={5}
                aria-invalid={Boolean(errors.details)}
                placeholder="Tell us which personal information this is about, and what you want us to do."
                onChange={(event) =>
                  setForm((current) => ({ ...current, details: event.target.value }))
                }
              />
              <FieldError>{errors.details}</FieldError>
            </Field>

            <Field data-invalid={Boolean(errors.desiredOutcome)}>
              <FieldLabel htmlFor="desiredOutcome">Desired outcome (optional)</FieldLabel>
              <Textarea
                id="desiredOutcome"
                value={form.desiredOutcome}
                rows={3}
                aria-invalid={Boolean(errors.desiredOutcome)}
                placeholder="For example: send me a copy, correct my date of birth, delete my contact details."
                onChange={(event) =>
                  setForm((current) => ({ ...current, desiredOutcome: event.target.value }))
                }
              />
              <FieldError>{errors.desiredOutcome}</FieldError>
            </Field>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not submit the request</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Sending…" : "Submit request"}
            </Button>

            <FieldDescription>
              By submitting you confirm the information is yours, or that you are authorised to act
              for the person concerned.
            </FieldDescription>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function Submitted({
  request,
  linked,
  onSubmitAnother,
}: {
  request: PopiaRequestPublic;
  linked: boolean;
  onSubmitAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(request.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="px-6 py-12 sm:px-10 lg:py-16" data-reveal>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <span className="font-mono text-xs text-muted-foreground">received</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
          Your request is with us.
        </h1>
        <p className="max-w-[60ch] leading-relaxed text-muted-foreground">
          Keep your reference number. You need it, together with your email address, to follow
          progress.
          {linked
            ? " This request is also listed under My requests."
            : " Sign in with the same email address to keep all your requests in one place."}
        </p>

        <div className="border border-border">
          <div className="flex flex-col gap-2 px-5 py-6">
            <span className="font-mono text-[11px] text-muted-foreground">reference</span>
            <span className="font-mono text-2xl font-medium tracking-tight">
              {request.reference}
            </span>
          </div>
          <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <Fact label="right" value={POPIA_REQUEST_TYPE_LABELS[request.type]} />
            <Fact label="received" value={formatDate(request.createdAt)} />
            <Fact label="response due" value={formatDate(request.dueAt)} />
          </dl>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void copyReference()}>
            {copied ? "Reference copied" : "Copy reference"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href="/popia/track" />}>
            Track this request
          </Button>
          <Button variant="ghost" onClick={onSubmitAnother}>
            Submit another
          </Button>
        </div>
      </div>
    </section>
  );
}
