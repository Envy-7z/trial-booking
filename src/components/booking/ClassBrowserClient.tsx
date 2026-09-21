"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Student {
  id: string;
  name: string;
  age: number;
  parentId: string;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  students: Student[];
}

interface TrialClassItem {
  id: string;
  subject: string;
  teacher: string;
  startsAt: string;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
  availableSeats: number;
}

interface ClassBrowserProps {
  initialClasses: TrialClassItem[];
  parents: Parent[];
}

export function ClassBrowserClient({ initialClasses, parents }: ClassBrowserProps) {
  // Default to first parent with children (e.g. Alice Chen)
  const defaultParent = parents[0] ?? null;
  const [selectedParentId, setSelectedParentId] = useState<string>(defaultParent?.id ?? "");

  const activeParent = parents.find((p) => p.id === selectedParentId) ?? defaultParent;
  const activeStudents = activeParent?.students ?? [];

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    activeStudents[0]?.id ?? ""
  );

  const handleParentChange = (newParentId: string) => {
    setSelectedParentId(newParentId);
    const parent = parents.find((p) => p.id === newParentId);
    if (parent && parent.students.length > 0) {
      setSelectedStudentId(parent.students[0].id);
    } else {
      setSelectedStudentId("");
    }
  };

  return (
    <div className="space-y-8">
      {/* Context bar: Parent & Child Picker */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
              Booking Context (Demo Actor)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the simulated parent and student for trial enrollment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="parent-select" className="text-xs font-medium text-slate-600">
                Parent:
              </label>
              <select
                id="parent-select"
                value={selectedParentId}
                onChange={(e) => handleParentChange(e.target.value)}
                className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 focus:outline-teal-600 focus:ring-1 focus:ring-teal-600"
              >
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="student-select" className="text-xs font-medium text-slate-600">
                Child:
              </label>
              <select
                id="student-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={activeStudents.length === 0}
                className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800 focus:outline-teal-600 focus:ring-1 focus:ring-teal-600 disabled:opacity-50"
              >
                {activeStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Age {s.age})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Class Schedule Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Available Trial Classes</h1>
            <p className="text-xs text-slate-600 mt-1">
              Live online sessions capped strictly at 4 confirmed students.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {initialClasses.map((c) => {
            const dateStr = new Date(c.startsAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <Card key={c.id} className="border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono text-slate-500 uppercase">
                      ID: {c.id}
                    </span>
                    {c.isFull ? (
                      <Badge variant="destructive" className="bg-rose-600 font-medium text-[11px]">
                        Full ({c.seatsTaken}/4)
                      </Badge>
                    ) : c.seatsTaken === 3 ? (
                      <Badge className="bg-amber-600 hover:bg-amber-700 font-medium text-[11px]">
                        1 Seat Left (3/4)
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 font-medium text-[11px]">
                        {c.availableSeats} Available ({c.seatsTaken}/4)
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base font-semibold text-slate-900 leading-snug">
                    {c.subject}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600 mt-1">
                    Instructor: <span className="font-medium text-slate-800">{c.teacher}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="text-xs text-slate-600 py-2 border-t border-b border-slate-100">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Scheduled:</span>
                    <span className="font-medium text-slate-800">{dateStr}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Class Cap:</span>
                    <span className="font-medium text-slate-800">4 Students</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Trial Fee:</span>
                    <span className="font-medium text-slate-800">Free Mock Trial</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-4">
                  <Link
                    href={`/classes/${c.id}${selectedStudentId ? `?studentId=${selectedStudentId}` : ""}`}
                    className="w-full"
                  >
                    <Button
                      variant={c.isFull ? "outline" : "default"}
                      className={`w-full text-xs font-medium ${
                        c.isFull
                          ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                          : "bg-teal-700 hover:bg-teal-800 text-white"
                      }`}
                    >
                      {c.isFull ? "View Class & Waitlist Info" : "Select & Book Trial"}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
