import Link from "next/link";
import { getConfirmedRosters } from "@/server/booking/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminRosterPage() {
  const rosters = await getConfirmedRosters();

  const totalConfirmed = rosters.reduce((acc, r) => acc + r.confirmedStudents.length, 0);
  const totalCapacity = rosters.reduce((acc, r) => acc + r.capacity, 0);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Teacher Roster & Attendance
            </h1>
            <Badge variant="outline" className="bg-slate-100 text-slate-700 text-xs font-mono">
              Admin View
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Official confirmed student rosters. Unpaid or pending bookings are strictly excluded.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="text-slate-500 block">Total Enrollment</span>
            <span className="font-semibold text-slate-900 font-mono">
              {totalConfirmed} / {totalCapacity} Seats Filled
            </span>
          </div>
          <Link href="/classes">
            <Button variant="outline" className="text-xs border-slate-300 font-medium">
              Browse Classes
            </Button>
          </Link>
        </div>
      </div>

      {/* Roster per Class */}
      <div className="space-y-6">
        {rosters.map((r) => {
          const dateStr = new Date(r.startsAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });

          const isFull = r.seatsTaken >= r.capacity;

          return (
            <Card key={r.classId} className="border-slate-200 shadow-xs">
              <CardHeader className="py-4 px-5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold text-slate-900">
                        {r.subject}
                      </CardTitle>
                      <span className="text-xs font-mono text-slate-400">
                        ({r.classId})
                      </span>
                    </div>
                    <CardDescription className="text-xs text-slate-600 mt-0.5">
                      Teacher: <span className="font-medium text-slate-800">{r.teacher}</span> • Scheduled: <span className="font-medium text-slate-800">{dateStr}</span>
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {isFull ? (
                      <Badge variant="destructive" className="bg-rose-600 text-xs font-medium">
                        Capacity Reached ({r.seatsTaken}/4)
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-600 text-xs font-medium">
                        {r.seatsTaken} / 4 Students Confirmed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {r.confirmedStudents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No confirmed students registered for this session yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead className="w-20">Age</TableHead>
                        <TableHead>Parent / Guardian</TableHead>
                        <TableHead>Contact Email</TableHead>
                        <TableHead className="text-right">Confirmed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y divide-slate-100">
                      {r.confirmedStudents.map((s, idx) => {
                        const confirmedDate = new Date(s.confirmedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        });

                        return (
                          <TableRow key={s.bookingId} className="hover:bg-slate-50/50">
                            <TableCell className="text-center font-mono text-slate-400">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-semibold text-slate-900">
                              {s.studentName}
                            </TableCell>
                            <TableCell className="text-slate-600 font-mono">
                              {s.studentAge} yo
                            </TableCell>
                            <TableCell className="text-slate-700">
                              {s.parentName}
                            </TableCell>
                            <TableCell className="text-slate-600 font-mono text-[11px]">
                              {s.parentEmail}
                            </TableCell>
                            <TableCell className="text-right text-slate-500 font-mono text-[11px]">
                              {confirmedDate}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
