import type { OnboardingPlan, PlanSkill } from "./plan";

/** The plan as copyable plain text, in the UI locale. */

type L = "fi" | "en";

export function qualificationType(code: string, l: L): string {
  const fi: Record<string, string> = {
    koulutustyyppi_1: "perustutkinto",
    koulutustyyppi_11: "ammattitutkinto",
    koulutustyyppi_12: "erikoisammattitutkinto",
  };
  const en: Record<string, string> = {
    koulutustyyppi_1: "vocational qualification",
    koulutustyyppi_11: "further vocational qualification",
    koulutustyyppi_12: "specialist vocational qualification",
  };
  return (l === "fi" ? fi : en)[code] ?? "";
}

const list = (skills: PlanSkill[], max = 12) => {
  const shown = skills.slice(0, max).map((s) => `• ${s.label}`);
  return skills.length > max ? [...shown, `• … (+${skills.length - max})`] : shown;
};

export function planText(plan: OnboardingPlan, l: L, date: Date): string {
  const T = (fi: string, en: string) => (l === "fi" ? fi : en);
  const out: string[] = [];
  const covered = plan.units.reduce((n, u) => n + u.skills.length, 0);

  out.push(T(`PEREHDYTYSPOLKU – ${plan.to.label}`, `ONBOARDING PATH – ${plan.to.label}`));
  out.push(`${T("Tausta", "Background")}: ${plan.from?.label ?? T("ei valittu", "not selected")}`);
  out.push(`${T("Laadittu", "Prepared")}: ${date.toLocaleDateString(l === "fi" ? "fi-FI" : "en-GB")}`);
  out.push("");
  out.push(
    T(
      `Lähtötilanne: taustasta löytyy ${plan.strengths.length}/${plan.totalEssential} roolin ydintaidosta. Puuttuvista ${plan.onTheJob.length} opitaan työpaikalla ja ${covered} tutkinnon osilla.`,
      `Starting point: the background covers ${plan.strengths.length}/${plan.totalEssential} of the role's essential skills. Of the gaps, ${plan.onTheJob.length} are learned at the workplace and ${covered} through qualification units.`
    )
  );
  out.push("");

  out.push(T("1. Hyödynnä olemassa oleva osaaminen (heti)", "1. Build on existing skills (from day one)"));
  out.push(...(plan.strengths.length ? list(plan.strengths) : [T("• –", "• –")]));
  out.push("");

  out.push(T("2. Perehdytys työpaikalla (0–3 kk)", "2. Workplace induction (0–3 months)"));
  out.push(...(plan.onTheJob.length ? list(plan.onTheJob, 20) : [T("• Ei erillisiä kohteita", "• Nothing separate")]));
  out.push(T("Vastuuhenkilö / työpari: ____________", "Responsible person / buddy: ____________"));
  out.push("");

  out.push(T("3. Tutkinnon osat (3–12 kk)", "3. Qualification units (3–12 months)"));
  if (plan.units.length === 0) out.push(T("• Ei sopivia tutkinnon osia", "• No matching units"));
  for (const u of plan.units) {
    out.push(`• ${u.title} – ${u.program.label} (${qualificationType(u.program.koulutustyyppi, l)})`);
    out.push(`  ${T("Kattaa", "Covers")}: ${u.skills.map((s) => s.label).join(", ")}`);
  }
  out.push("");

  if (plan.later.length) {
    out.push(T("4. Myöhemmin (valinnaiset taidot)", "4. Later (optional skills)"));
    out.push(...list(plan.later, 8));
    out.push("");
  }

  out.push(T("Toteutus ja rahoitus (tarkista ehdot)", "Delivery and funding (check the terms)"));
  out.push(
    T(
      "• Oppisopimus: tutkinnon osat voi suorittaa työn ohessa; työnantajalle voidaan maksaa koulutuskorvausta.",
      "• Apprenticeship (oppisopimus): units can be completed while working; the employer may receive a training compensation."
    )
  );
  out.push(
    T(
      "• Yhteishankintakoulutus: RekryKoulutus uusille työntekijöille, TäsmäKoulutus nykyiselle henkilöstölle.",
      "• Joint-purchase training: RekryKoulutus for new hires, TäsmäKoulutus for existing staff."
    )
  );
  out.push(T("• Yhteys: alueen ammatillinen oppilaitos tai työllisyyspalvelut.", "• Contact: a local vocational institution or employment services."));
  out.push("");
  out.push(
    T(
      "Huom: polku vertaa kahta ammattia ESCO-luokituksen perusteella – se ei arvioi henkilöä. Varmista todellinen osaaminen keskustelussa uuden työntekijän kanssa. Lähteet: ESCO v1.2.1, Opetushallituksen ePerusteet.",
      "Note: the path compares two occupations using ESCO – it does not assess the person. Confirm actual skills in a conversation with the new hire. Sources: ESCO v1.2.1, the Finnish National Agency for Education's ePerusteet."
    )
  );
  return out.join("\n");
}
