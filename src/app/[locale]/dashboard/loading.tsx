import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          "lg:col-span-1",
          "lg:col-span-2",
          "lg:col-span-2",
          "lg:col-span-1",
          "lg:col-span-3",
        ].map((span, i) => (
          <Card key={i} className={span}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-44 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
