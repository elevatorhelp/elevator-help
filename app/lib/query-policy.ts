export function requiresStandardSafetyCheck(question: string) {
  const explicitStandard =
    /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) ||
    /\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question) ||
    /(استاندارد|نورم|نُرم)/i.test(question);
  const bindingValue =
    /\b(min(?:imum)?\.?|max(?:imum)?\.?|mindestens|höchstens|zulässig|vorgeschrieben|pflicht|erforderlich|muss|darf|clearance|distance|diameter|durchmesser|abstand|schutzraum|refuge|guardrail)\b/i.test(
      question,
    ) ||
    /(حداقل|حداکثر|مجاز|اجباری|الزامی|فاصله|قطر|چقدر\s+باید)/i.test(question);
  const measurableProperty =
    /\b(mm|cm|m|kg|kn|grad|degree|durchmesser|diameter|höhe|height|breite|width|tiefe|depth|abstand|clearance|distance)\b/i.test(
      question,
    ) || /(قطر|ارتفاع|عرض|عمق|فاصله|میلی.?متر|سانتی.?متر)/i.test(question);

  return explicitStandard || (bindingValue && measurableProperty);
}
