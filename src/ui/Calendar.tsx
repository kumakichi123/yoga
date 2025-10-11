import React from "react";

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

type CalendarProps = {
  year: number;
  month: number;
  marks: Set<string>; // "YYYY-MM-DD"
  selected?: string | null;
  onSelect?: (date: string) => void;
};

export default function Calendar({ year, month, marks, selected, onSelect }: CalendarProps) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday = 0
  const total = daysInMonth(year, month);
  const cells: { day: number | null; iso?: string }[] = [];

  for (let i = 0; i < startWeekday; i++) cells.push({ day: null });
  for (let day = 1; day <= total; day++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const iso = `${year}-${mm}-${dd}`;
    cells.push({ day, iso });
  }
  while (cells.length % 7) cells.push({ day: null });

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="cal">
      <div className="cal-grid">
        {weekdays.map((weekday) => (
          <div key={weekday} className="muted" style={{ textAlign: "center" }}>
            {weekday}
          </div>
        ))}
        {cells.map((cell, index) => {
          const hasData = !!(cell.iso && marks.has(cell.iso));
          const isSelected = !!(cell.iso && selected === cell.iso);
          const isClickable = !!(cell.iso && onSelect);
          const style: React.CSSProperties = {};

          if (isSelected) {
            style.borderColor = "var(--brand, #a855f7)";
            style.background = "var(--brand-soft, #f1eafe)";
            style.color = "var(--brand-dark, #7c3aed)";
            style.fontWeight = 700;
          } else if (hasData) {
            style.borderColor = "var(--brand, #a855f7)";
          }
          if (isClickable) {
            style.cursor = "pointer";
          }

          const handleClick = () => {
            if (isClickable && cell.iso) onSelect?.(cell.iso);
          };

          const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (!isClickable || !cell.iso) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect?.(cell.iso);
            }
          };

          return (
            <div
              key={index}
              className="cell"
              style={style}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              aria-pressed={isClickable ? isSelected : undefined}
            >
              {cell.day}
              {hasData && <span className="dot"></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
