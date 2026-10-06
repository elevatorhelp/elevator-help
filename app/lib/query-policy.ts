export function requiresStandardSafetyCheck(question: string) {
  const explicitStandard =
    /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) ||
    /\b(DIN\s*)?(norm|normen|standard|standards|norma|normas)\b/i.test(question) ||
    /(استاندارد|نورم|نُرم)/i.test(question);
  const bindingValue =
    /\b(min(?:imum)?\.?|max(?:imum)?\.?|mínim[oa]|máxim[oa]|mindestens|höchstens|zulässig|vorgeschrieben|pflicht|erforderlich|muss|darf|permitid[oa]|obligatori[oa]|clearance|distance|distancia|separación|diameter|diámetro|durchmesser|abstand|schutzraum|refuge|guardrail)\b/i.test(
      question,
    ) ||
    /(حداقل|حداکثر|مجاز|اجباری|الزامی|فاصله|قطر|چقدر\s+باید)/i.test(question);
  const measurableProperty =
    /\b(mm|cm|m|kg|kn|grad|degree|durchmesser|diameter|diámetro|höhe|height|altura|breite|width|anchura|tiefe|depth|profundidad|abstand|clearance|distance|distancia|separación)\b/i.test(
      question,
    ) || /(قطر|ارتفاع|عرض|عمق|فاصله|میلی.?متر|سانتی.?متر)/i.test(question);

  return explicitStandard || (bindingValue && measurableProperty);
}
