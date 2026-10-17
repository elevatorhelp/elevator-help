export type StarterAction = {
  id: string;
  label: string;
  initialQuestion: string;
};

// Starter actions are presentation-only. They seed natural-language input and
// must never select a retrieval route, document, standard, supplier or domain.
// The normal question resolver remains the single decision point.
export const starterActions: readonly StarterAction[] = [
  {
    id: "troubleshoot",
    label: "Troubleshoot a fault",
    initialQuestion:
      "I have an elevator fault. Help me troubleshoot it step by step.",
  },
  {
    id: "documentation",
    label: "Search technical documentation",
    initialQuestion:
      "Help me find information in technical elevator documentation.",
  },
  {
    id: "standards",
    label: "What do the standards say about…?",
    initialQuestion: "What do the standards say about ",
  },
  {
    id: "planning",
    label: "Plan or calculate an elevator",
    initialQuestion: "Help me plan or calculate an elevator for ",
  },
];
