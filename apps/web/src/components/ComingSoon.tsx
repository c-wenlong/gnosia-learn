import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * A page the new top bar links to before its phase has built it, so the bar
 * has no dead links. Phase 1 replaces each one; see
 * docs/design/IMPLEMENTATION.md.
 */
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div data-layout="app" className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-bold text-text">{title}</h1>
      <Card className="max-w-xl items-start">
        <Eyebrow>Coming soon</Eyebrow>
        <p className="text-text2">{children}</p>
        <Button href="/courses" variant="secondary">
          Back to courses
        </Button>
      </Card>
    </div>
  );
}
