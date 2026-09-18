export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-background px-5 py-4">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
