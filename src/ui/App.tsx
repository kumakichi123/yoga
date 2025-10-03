import React, { useState } from "react";
import Yoga from "../pages/Yoga";
import History from "../pages/History";
import Settings from "../pages/Settings";
import NavBar from "./NavBar";

type Tab = "yoga"|"history"|"settings";

export default function App(){
  const [tab,setTab]=useState<Tab>("yoga");
  return (
    <div className="container row" style={{paddingBottom:80}}>
      <header className="row"><h1 className="h">5分ヨガ</h1></header>
      {tab==="yoga" && <Yoga/>}
      {tab==="history" && <History/>}
      {tab==="settings" && <Settings/>}
      <NavBar tab={tab} setTab={setTab}/>
    </div>
  );
}
