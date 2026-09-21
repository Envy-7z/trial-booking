import { getAvailableClasses, getParentsWithStudents } from "@/server/booking/service";
import { ClassBrowserClient } from "@/components/booking/ClassBrowserClient";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const [classes, parents] = await Promise.all([
    getAvailableClasses(),
    getParentsWithStudents(),
  ]);

  const serializedClasses = classes.map((c) => ({
    ...c,
    startsAt: c.startsAt.toISOString(),
  }));

  return (
    <div>
      <ClassBrowserClient initialClasses={serializedClasses} parents={parents} />
    </div>
  );
}
