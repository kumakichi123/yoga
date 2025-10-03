import React from "react";
type Tab = "yoga"|"history"|"settings";
export default function NavBar({tab,setTab}:{tab:Tab;setTab:(t:Tab)=>void}){
  return (
    <div className="bottom">
      <div className="nav">
        <button className={`btn ${tab==='yoga'?'primary':''}`} onClick={()=>setTab("yoga")}>ヨガ</button>
        <button className={`btn ${tab==='history'?'primary':''}`} onClick={()=>setTab("history")}>履歴</button>
        <button className={`btn ${tab==='settings'?'primary':''}`} onClick={()=>setTab("settings")}>設定</button>
      </div>
    </div>
  );
}
