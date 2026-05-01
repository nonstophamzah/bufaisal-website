'use client';

import { TrendingUp } from 'lucide-react';
import { Section } from './Section';

export function IntakeChart({
  intakeVelocity,
  maxIntake,
  todayCount,
  yesterdayCount,
  intakeDelta,
}: {
  intakeVelocity: Array<{ date: Date; dayName: string; count: number }>;
  maxIntake: number;
  todayCount: number;
  yesterdayCount: number;
  intakeDelta: number;
}) {
  return (
    <Section title="7-DAY INTAKE" icon={TrendingUp} defaultOpen={true}>
      <div className="flex items-end gap-1.5 h-28">
        {intakeVelocity.map((day) => {
          const heightPct = maxIntake > 0 ? (day.count / maxIntake) * 100 : 0;
          const isToday = day.date.toDateString() === new Date().toDateString();
          return (
            <div key={day.date.toISOString()} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-xs font-bold ${day.count > 0 ? 'text-white' : 'text-gray-600'}`}>
                {day.count || ''}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-t-md transition-all duration-500 min-h-[2px] ${
                    day.count > 0 ? (isToday ? 'bg-yellow' : 'bg-yellow/50') : 'bg-gray-800'
                  }`}
                  style={{ height: `${Math.max(heightPct, 3)}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold ${isToday ? 'text-yellow' : 'text-gray-500'}`}>
                {day.dayName}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-gray-500">
          Today: <span className="text-white font-bold">{todayCount}</span>
        </span>
        <span className="text-gray-500">
          Yesterday: <span className="text-white font-bold">{yesterdayCount}</span>
        </span>
        <span
          className={`font-bold ${intakeDelta > 0 ? 'text-green-400' : intakeDelta < 0 ? 'text-red-400' : 'text-gray-500'}`}
        >
          {intakeDelta > 0 ? '+' : ''}{intakeDelta} delta
        </span>
      </div>
    </Section>
  );
}
