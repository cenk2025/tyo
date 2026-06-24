"use client";

import { useTranslations } from "next-intl";
import { Leaf, MonitorSmartphone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Skill } from "@/lib/esco/types";

/**
 * Green & digital readiness: how many of the user's skills belong to the ESCO
 * green-economy and digital-skills collections. Two independent indicators (a
 * skill can be both), counted from the dashboard's existing skill set — no
 * extra fetch. Flags come from skills.is_green / is_digital (migration 0005).
 */
export function GreenDigital({ skills }: { skills: Skill[] }) {
  const t = useTranslations("dashboard");
  const total = skills.length;
  const green = skills.filter((s) => s.isGreen).length;
  const digital = skills.filter((s) => s.isDigital).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-5">
      <Indicator
        icon={<Leaf className="h-4 w-4 text-emerald-600" />}
        label={t("greenSkills")}
        count={green}
        total={total}
        pct={pct(green)}
        barClass="bg-emerald-500"
        ofTotal={t("ofTotal", { count: green, total })}
      />
      <Indicator
        icon={<MonitorSmartphone className="h-4 w-4 text-sky-600" />}
        label={t("digitalSkills")}
        count={digital}
        total={total}
        pct={pct(digital)}
        barClass="bg-sky-500"
        ofTotal={t("ofTotal", { count: digital, total })}
      />
      <p className="text-xs text-muted-foreground">{t("greenDigitalHint")}</p>
    </div>
  );
}

function Indicator({
  icon,
  label,
  pct,
  barClass,
  ofTotal,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  pct: number;
  barClass: string;
  ofTotal: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {ofTotal} · {pct}%
        </span>
      </div>
      <Progress value={pct} indicatorClassName={barClass} aria-label={`${label} ${pct}%`} />
    </div>
  );
}
