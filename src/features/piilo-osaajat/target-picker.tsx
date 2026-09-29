"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { OccupationSearch } from "@/features/explore/occupation-search";

/** Pick the role to find hidden talent for. */
export function TargetPicker() {
  const t = useTranslations("hiddenTalent.picker");
  const router = useRouter();
  return (
    <OccupationSearch
      placeholder={t("search")}
      onSelect={(o) => router.push(`/piilo-osaajat?to=${encodeURIComponent(o.code)}`)}
    />
  );
}
