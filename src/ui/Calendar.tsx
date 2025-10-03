import React from "react";

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate(); }

export default function Calendar({ year, month, marks }:{
  year:number; month:number; marks:Set<string>; // marks: "YYYY-MM-DD"
}){
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay()+6)%7; // Mon=0
  const total = daysInMonth(year, month);
  const cells: {d:number|null,str?:string}[] = [];
  for(let i=0;i<startWeekday;i++) cells.push({d:null});
  for(let d=1; d<=total; d++){
    const mm = String(month+1).padStart(2,"0");
    const dd = String(d).padStart(2,"0");
    const str = `${year}-${mm}-${dd}`;
    cells.push({ d, str });
  }
  while(cells.length%7) cells.push({d:null});
  return (
    <div className="cal">
      <div className="cal-grid">
        {["月","火","水","木","金","土","日"].map(w=><div key={w} className="muted" style={{textAlign:"center"}}>{w}</div>)}
        {cells.map((c,i)=>(
          <div key={i} className="cell">{c.d}{c.str && marks.has(c.str) && <span className="dot"></span>}</div>
        ))}
      </div>
    </div>
  );
}
