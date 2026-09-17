import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@voltedge/ui";

const faqs = [
  {
    value: "official",
    question: "Is this an official Stats SA answer?",
    answer:
      "Yes — answers come from published Stats SA information, and each one points to the documents it used. Media and sensitive queries are prepared for review by Stats SA before any response is issued.",
  },
  {
    value: "sources",
    question: "Where does the information come from?",
    answer:
      "Published statistical releases, datasets and publications. You can open the referenced documents and check the facts for yourself.",
  },
  {
    value: "media",
    question: "What happens to media queries?",
    answer:
      "They are not answered automatically. Rafiki prepares a clearly referenced draft, and a Stats SA official reviews and approves it before it is used.",
  },
  {
    value: "gaps",
    question: "What if there is no published answer?",
    answer:
      "Rafiki will tell you it cannot answer from published sources rather than guessing or making something up.",
  },
  {
    value: "account",
    question: "Do I need an account?",
    answer:
      "No. Public search is open to everyone. You only sign in when you need the media or staff side of Rafiki.",
  },
  {
    value: "languages",
    question: "Can I get answers in other languages?",
    answer:
      "Multilingual support is being explored, so more people can use official information in the language they are most comfortable with.",
  },
  {
    value: "systems",
    question: "Can other systems use Rafiki?",
    answer:
      "Yes — Rafiki is designed as a service that Stats SA websites and systems can connect to.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            FAQ
          </p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Questions people ask first
          </h2>
        </div>
        <div className="max-w-3xl">
          <Accordion defaultValue={["official"]}>
            {faqs.map((faq) => (
              <AccordionItem key={faq.value} value={faq.value}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
