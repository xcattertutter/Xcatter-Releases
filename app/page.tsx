"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "items" | "prices" | "history";
type LogStatus = { connected:boolean; path:string|null; updating:boolean };
type AppInfo = { version:string; dataPath:string };
type LiveItem = { id?:string|number; configId:number; name:string; icon?:string|null; quantity:number; unitPrice:number; totalValue:number; stackable?:boolean; priceSource?:string|null; pricedAt?:string|null };
type MapHistory = { schemaVersion?:number; id:string; name:string; tier?:string|null; levelId?:number|null; startedAt:string; completedAt:string; durationSeconds:number; feDropped?:number; totalValue:number; cost?:number; profit?:number; items:LiveItem[]; costItems?:LiveItem[] };
type LiveLog = { feGained:number; pickupCount:number; estimatedValue:number; sessionStartedAt:string|null; sessionProfit:number; sessionMaps:MapHistory[]; priceCount:number; zone:string; currentMap:string; mapTier:string|null; levelId:number|null; mapStartedAt:string|null; mapDurationSeconds:number; mapPausedMs:number; pauseStartedAt:number|null; mapActive:boolean; mapValue:number; mapFeDropped:number; mapItems:LiveItem[]; excludedItems:LiveItem[]; mapCost:number; mapCostItems:LiveItem[]; mapHistory:MapHistory[]; paused:boolean; initialized:boolean; items:LiveItem[]; recent:Array<LiveItem & {id:number;time:string}> };
type PriceSyncStatus = { syncing:boolean; available:boolean; lastSuccessAt:string|null; imported:number; message:string };
type CloudStatus = { syncing:boolean; connected:boolean; lastSuccessAt:string|null; uploaded:number; downloaded:number; message:string };
type UpdateStatus = { status:"idle"|"unconfigured"|"checking"|"up-to-date"|"available"|"downloading"|"ready"|"installing"|"error"; currentVersion:string; latestVersion:string|null; message:string; progress:number; releaseUrl:string|null; notes:string|null };
const TRADE_TAX_RATE = 0.125;
const NET = 1 - TRADE_TAX_RATE;

const nav:Array<{id:Tab;icon:"dashboard"|"backpack"|"market"|"history";label:string}> = [
  { id:"overview", icon:"dashboard", label:"Overview" }, { id:"items", icon:"backpack", label:"Items" },
  { id:"prices", icon:"market", label:"Price Database" }, { id:"history", icon:"history", label:"History" },
];
function AppIcon({name}:{name:"dashboard"|"backpack"|"market"|"history"|"chart"|"settings"|"refresh"|"flame"|"reset"|"xmark"|"overlay"|"pause"|"play"}) {
  const paths={dashboard:<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,backpack:<><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M8 21v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/><path d="M8 10h8"/><path d="M8 14h8"/></>,market:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></>,history:<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,pause:<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>,play:<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>,chart:<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,settings:<><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></>,refresh:<><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></>,flame:<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,reset:<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>,overlay:<><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><rect width="7" height="7" x="10" y="10" rx="1"/></>};
  if(name==="xmark") return <svg className="appIcon xLogo" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h5.2L20 21h-5.2L4 3Z"/><path className="xCut" d="M20 3h-5.2L4 21h5.2L20 3Z"/></svg>;
  return <svg className="appIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name as keyof typeof paths]}</svg>;
}
const money = (value:number) => Math.round(value).toLocaleString();
function Img({src,alt}:{src:string;alt?:string}){const[err,setErr]=useState(false);return err?<i>✦</i>:<img src={src} alt={alt||""} onError={()=>setErr(true)}/>;}
const clock = (value:number) => `${String(Math.floor(value/3600)).padStart(2,"0")}:${String(Math.floor(value/60)%60).padStart(2,"0")}:${String(Math.floor(value)%60).padStart(2,"0")}`;
const age = (date?:string|null) => {
  if (!date) return "Unknown"; const hours = (Date.now() - Date.parse(date)) / 3600000;
  return hours < 1 ? "Fresh" : hours < 24 ? `${Math.floor(hours)}h old` : `${Math.floor(hours / 24)}d old`;
};

export default function Home() {
  const [tab,setTab] = useState<Tab>("overview");
  const [running,setRunning] = useState(true);
  const [seconds,setSeconds] = useState(0);
  const [query,setQuery] = useState("");
  const [itemPage,setItemPage] = useState(1);
  const [mapPage,setMapPage] = useState(1);
  const [lootView,setLootView] = useState<"picked"|"cost"|"gear">("picked");
  const [expandedMap,setExpandedMap] = useState<string|null>(null);
  const [now,setNow] = useState(Date.now());
  const [setup,setSetup] = useState(false);
  const [confirmReset,setConfirmReset] = useState(false);
  const [locating,setLocating] = useState(false);
  const [logStatus,setLogStatus] = useState<LogStatus>({connected:false,path:null,updating:false});
  const [live,setLive] = useState<LiveLog>({feGained:0,pickupCount:0,estimatedValue:0,sessionStartedAt:null,sessionProfit:0,sessionMaps:[],priceCount:0,zone:"Waiting for a map…",currentMap:"Waiting for a map…",mapTier:null,levelId:null,mapStartedAt:null,mapDurationSeconds:0,mapPausedMs:0,pauseStartedAt:null,mapActive:false,mapValue:0,mapFeDropped:0,mapItems:[],excludedItems:[],mapCost:0,mapCostItems:[],mapHistory:[],paused:false,initialized:false,items:[],recent:[]});
  const [priceSync,setPriceSync] = useState<PriceSyncStatus>({syncing:false,available:false,lastSuccessAt:null,imported:0,message:"Optional"});
  const [manualSyncing,setManualSyncing] = useState(false);
  const [cloud,setCloud] = useState<CloudStatus>({syncing:false,connected:false,lastSuccessAt:null,uploaded:0,downloaded:0,message:"Cloud not configured"});
  const [cloudForm,setCloudForm] = useState({endpoint:"",sharingKey:""});
  const [shareMessage,setShareMessage] = useState("Anonymous Afterlight price backup.");
  const [appInfo,setAppInfo] = useState<AppInfo>({version:"…",dataPath:""});
  const [update,setUpdate] = useState<UpdateStatus>({status:"idle",currentVersion:"",latestVersion:null,message:"Updates are checked automatically",progress:0,releaseUrl:null,notes:null});
  const [profitBasis,setProfitBasis] = useState<"gross"|"after-tax">("gross");
  const [ratePeriod,setRatePeriod] = useState<"minute"|"hour">("minute");

  useEffect(() => {
    const bridge=(window as any).torchtrack; if(!bridge) return;
    bridge.getAppInfo().then(setAppInfo); bridge.getLogStatus().then(setLogStatus); bridge.getLive().then(setLive); bridge.getPriceSyncStatus().then(setPriceSync); bridge.getUpdateStatus().then(setUpdate);
    bridge.getCloudStatus().then(setCloud); bridge.getCloudConfig().then((v:any)=>setCloudForm((old)=>({...old,endpoint:v.endpoint||""})));
    const off1=bridge.onLogStatus(setLogStatus), off2=bridge.onLive(setLive), off3=bridge.onPriceSyncStatus(setPriceSync), off4=bridge.onCloudStatus(setCloud), off5=bridge.onUpdateStatus(setUpdate);
    return ()=>{off1?.();off2?.();off3?.();off4?.();off5?.();};
  },[]);
  useEffect(()=>{ if(!running)return; const timer=setInterval(()=>setSeconds(v=>v+1),1000); return()=>clearInterval(timer); },[running]);
  useEffect(()=>{ const timer=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(timer); },[]);
  useEffect(()=>setItemPage(1),[query]);
  useEffect(()=>setMapPage(1),[live.currentMap]);
  const shownItems=useMemo(()=>live.items.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.totalValue-a.totalValue),[live.items,query]);
  const itemPages=Math.max(1,Math.ceil(shownItems.length/8));
  const pagedItems=shownItems.slice((itemPage-1)*8,itemPage*8);
  const mapPages=Math.max(1,Math.ceil(live.mapItems.length/8));
  const pagedMapItems=live.mapItems.slice((mapPage-1)*8,mapPage*8);
  const time=clock(seconds);
  const pausedNowMs=live.paused&&live.pauseStartedAt?Math.max(0,now-live.pauseStartedAt):0;
  const activeMapSeconds=live.mapActive&&live.mapStartedAt?Math.max(0,(now-Date.parse(live.mapStartedAt)-live.mapPausedMs-pausedNowMs)/1000):0;
  const mapTime=clock(activeMapSeconds||live.mapDurationSeconds||0);
  const totalMapSeconds=live.sessionMaps.reduce((sum,map)=>sum+Number(map.durationSeconds||0),0)+activeMapSeconds;
  const afterTaxMapProfit=(totalValue:number,feDropped:number,cost:number)=>feDropped+Math.max(0,totalValue-feDropped)*(1-TRADE_TAX_RATE)-cost;
  const completedAfterTaxProfit=live.sessionMaps.reduce((sum,map)=>sum+afterTaxMapProfit(Number(map.totalValue||0),Number(map.feDropped||0),Number(map.cost||0)),0);
  const sessionAfterTaxProfit=completedAfterTaxProfit+(live.mapActive?afterTaxMapProfit(live.mapValue,live.mapFeDropped,live.mapCost):0);
  const displayedProfit=profitBasis==="gross"?live.sessionProfit:sessionAfterTaxProfit;
  const afterTax=profitBasis==="after-tax";
  const itemNet=(configId:number,value:number)=>afterTax&&configId!==100300?value*NET:value;
  const mapNetValue=(totalValue:number,feDropped:number)=>afterTax?(feDropped||0)+Math.max(0,(totalValue||0)-(feDropped||0))*NET:totalValue||0;
  const netMapProfit=(totalValue:number,feDropped:number,cost:number)=>afterTax?afterTaxMapProfit(totalValue,feDropped,cost):(totalValue||0)-(cost||0);
  const mapLogProfitColor=(profit:number)=>profit<0?"mapProfitLoss":profit>=21?"mapProfitHot":"mapProfitMid";
  const netBackpackValue=live.items.reduce((s,i)=>s+itemNet(i.configId,i.totalValue),0);
  const rateHours=seconds/3600;
  const displayedRate=rateHours>0?(ratePeriod==="hour"?displayedProfit/rateHours:displayedProfit/(rateHours*60)):0;
  const bridge=()=> (window as any).torchtrack;
  async function locate(manual=false){setLocating(true);setLogStatus(await(manual?bridge()?.chooseLog():bridge()?.autoLocateLog()));setLocating(false);}
  async function saveCloud(){const result=await bridge()?.saveCloud(cloudForm);if(!result?.ok)setCloud(v=>({...v,message:result.error}));}
  async function importPrices(){const r=await bridge()?.importPrices();if(r&&!r.canceled)setShareMessage(`Imported ${r.imported} prices from ${r.files} file${r.files===1?"":"s"}.`);}
  async function exportPrices(){const r=await bridge()?.exportPrices();if(r&&!r.canceled)setShareMessage(`Exported ${r.count} prices. Ready to share.`);}
  async function updatePricesNow(){
    if(manualSyncing||priceSync.syncing||cloud.syncing)return;
    setManualSyncing(true);
    try{
      await Promise.allSettled([bridge()?.syncPrices(),bridge()?.syncCloud()]);
      const [localStatus,cloudStatus]=await Promise.all([bridge()?.getPriceSyncStatus(),bridge()?.getCloudStatus()]);
      if(localStatus)setPriceSync(localStatus); if(cloudStatus)setCloud(cloudStatus);
    }finally{setManualSyncing(false);}
  }
  async function togglePause(){const next=!running;setRunning(next);await bridge()?.setPaused(!next);}
  async function resetSession(){await bridge()?.resetSession();setSeconds(0);setConfirmReset(false);}
  async function updateApp(){
    if(update.status==="available") await bridge()?.downloadUpdate();
    else if(update.status==="ready") await bridge()?.installUpdate();
    else if(!["checking","downloading","installing"].includes(update.status)) await bridge()?.checkForUpdates();
  }
  const pager=(page:number,pages:number,setPage:(value:number)=>void)=><div className="pagination"><button disabled={page===1} onClick={()=>setPage(Math.max(1,page-1))}>‹</button>{Array.from({length:Math.min(5,pages)},(_,index)=>{const start=Math.min(Math.max(1,page-2),Math.max(1,pages-4));const value=start+index;return <button key={value} className={page===value?"active":""} onClick={()=>setPage(value)}>{value}</button>})}<button disabled={page===pages} onClick={()=>setPage(Math.min(pages,page+1))}>›</button></div>;

  return <main className="appShell">
    <aside className="sidebar">
      <div className="brand"><span className="brandmark"><img src="./xcatter-logo.png" alt="Xcatter"/></span><span className="brandText"><strong>Xcatter</strong><small>Afterlight companion</small></span></div>
      <nav>{nav.map(item=><button key={item.id} title={item.label} className={tab===item.id?"active":""} onClick={()=>setTab(item.id)}><i><AppIcon name={item.icon}/></i><span className="navLabel">{item.label}</span>{item.id==="prices"&&<b>{live.priceCount}</b>}</button>)}</nav>
      <div className="sideFoot"><button title="Switch to mini window" aria-label="Switch to mini window" onClick={()=>bridge()?.openMini()}><i><AppIcon name="overlay"/></i><span className="navLabel">Mini</span></button></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><h1>{tab==="overview"?"Overview":tab==="items"?"Items":tab==="prices"?"Price Database":"History"}</h1><p>{live.zone}{live.mapTier?` · ${live.mapTier}`:""}</p></div><div className="topActions"><span className="buildVersion" title={appInfo.dataPath}>v{appInfo.version}</span><span className="season">SS13 · Afterlight</span><span className={`recording ${logStatus.updating?"on":""}`}><i/>{logStatus.updating?"Recording":"Waiting for game"}</span><button className={`appUpdateButton ${update.status}`} title={update.status==="available"?`Download Xcatter v${update.latestVersion}`:update.status==="ready"?"Install update and restart":"Check for app updates"} aria-label="Check for app updates" disabled={["checking","downloading","installing"].includes(update.status)} onClick={updateApp}><AppIcon name="refresh"/>{["available","ready"].includes(update.status)&&<i>!</i>}</button><button title="Data setup" onClick={()=>setSetup(true)}><AppIcon name="settings"/></button></div></header>
      {["available","downloading","ready","installing","error"].includes(update.status)&&<section className={`updateNotice ${update.status}`} role="status"><span className="updateMark"><AppIcon name="refresh"/></span><span className="updateCopy"><b>{update.status==="available"?`Xcatter v${update.latestVersion} is available`:update.status==="ready"?"Update downloaded":update.status==="error"?"Update needs attention":"Updating Xcatter"}</b><small>{update.message}</small></span><span className="updateActions">{update.status==="available"&&<button className="primary" onClick={updateApp}>Update now</button>}{update.status==="downloading"&&<button disabled>Downloading {update.progress}%</button>}{update.status==="ready"&&<button className="primary" onClick={updateApp}>Install & restart</button>}{update.status==="installing"&&<button disabled>Restarting…</button>}{update.status==="error"&&<button onClick={updateApp}>Try again</button>}</span></section>}

      {tab==="overview"&&<div className="page overview">
        <section className="runHero panel">
          <div className="runHeroHead"><div><span className="eyebrow">CURRENT RUN</span><h2>{live.currentMap}</h2><p>{live.mapTier||"Waiting for a Netherrealm map"}</p></div><div className="runState"><span className={live.mapActive?"live":"idle"}><i/>{live.mapActive?"Map active":"Ready"}</span><strong>{mapTime}</strong></div></div>
          <div className="runMetrics">
            <article><label>BACKPACK VALUE</label><strong>{money(afterTax?netBackpackValue:live.estimatedValue)}<small> FE</small></strong><div className="spark blue"/></article>
            <article><div className="metricHead"><label>SESSION PROFIT</label><span className="metricToggle"><button className={profitBasis==="gross"?"active":""} onClick={()=>setProfitBasis("gross")}>Gross</button><button className={`afterTax ${profitBasis==="after-tax"?"active":""}`} onClick={()=>setProfitBasis("after-tax")} title="Estimated 12.5% Trade House tax; raw FE drops are not taxed">After tax</button></span></div><strong className={displayedProfit<0?"red":"teal"} style={{color:"var(--teal)"}}>{money(displayedProfit)}<small> FE</small></strong><div className="spark teal"/></article>
            <article><div className="metricHead"><label>PROFIT RATE</label><span className="metricToggle rateToggle"><button className={ratePeriod==="minute"?"active":""} onClick={()=>setRatePeriod("minute")}>/min</button><button className={ratePeriod==="hour"?"active":""} onClick={()=>setRatePeriod("hour")}>/hr</button></span></div><strong className="cyan">{displayedRate.toFixed(1)}<small> FE/{ratePeriod==="hour"?"hr":"min"}</small></strong><div className="spark cyan"/></article>
            <article className="sessionFacts"><div><span>Session time</span><span className="timerControl"><b>{time}</b><button onClick={togglePause} title={running?"Pause session":"Resume session"}>{running?<AppIcon name="pause"/>:<AppIcon name="play"/>}</button><i className="timerDivider"/><button className="resetSession" onClick={()=>setConfirmReset(true)} title="Reset session" aria-label="Reset session"><AppIcon name="reset"/></button></span></div><div><span>Map time</span><b>{clock(totalMapSeconds).slice(3)}</b></div><div><span>Maps completed</span><b>{live.sessionMaps.length}</b></div><div><span>Current map</span><b>{live.mapActive?mapTime.slice(3):"—"}</b></div></article>
          </div>
        </section>
        <section className="overviewSplit">
          <article className="panel mapLogPanel"><div className="historyLogHead"><h2>Map Log <span>{live.sessionMaps.length+(live.mapActive?1:0)}</span></h2><em><i/>{running?"Recording":"Paused"}</em></div><div className="mapLogColumns"><span>Map / Time</span><span>Picked Up</span><span>Cost</span><span>Profit</span><span>Efficiency</span><span>Duration</span></div>{live.mapActive&&<div className="mapLogRow current"><span><b>{live.currentMap}</b><small>Current map{live.mapTier?` · ${live.mapTier}`:""}</small></span><span>{mapNetValue(live.mapValue,live.mapFeDropped).toFixed(1)}</span><span>-{live.mapCost.toFixed(1)}</span><span className={mapLogProfitColor(netMapProfit(live.mapValue,live.mapFeDropped,live.mapCost))}>{netMapProfit(live.mapValue,live.mapFeDropped,live.mapCost).toFixed(1)}</span><span>{live.mapStartedAt&&now>Date.parse(live.mapStartedAt)?(netMapProfit(live.mapValue,live.mapFeDropped,live.mapCost)/((now-Date.parse(live.mapStartedAt))/60000)).toFixed(1):"0"}</span><span>{mapTime.slice(3)}</span></div>}{live.sessionMaps.slice(0,8).map((map,index)=><div className={`mapLogRow ${!live.mapActive&&index===0?"current":""}`} key={map.id}><span><b>{map.name}</b><small>{new Date(map.completedAt).toLocaleTimeString()}{map.tier?` · ${map.tier}`:""}</small></span><span>{mapNetValue(map.totalValue,map.feDropped||0).toFixed(1)}</span><span>-{(map.cost||0).toFixed(1)}</span><span className={mapLogProfitColor(netMapProfit(map.totalValue,map.feDropped||0,map.cost||0))}>{netMapProfit(map.totalValue,map.feDropped||0,map.cost||0).toFixed(1)}</span><span>{map.durationSeconds?(netMapProfit(map.totalValue,map.feDropped||0,map.cost||0)/(map.durationSeconds/60)).toFixed(1):"0"}</span><span>{clock(map.durationSeconds).slice(3)}</span></div>)}</article>
          <article className="panel lootPanel"><div className="lootTabs"><button className={lootView==="picked"?"active":""} onClick={()=>setLootView("picked")}>Picked Up</button><button className={lootView==="cost"?"active":""} onClick={()=>setLootView("cost")}>Cost</button><button className={lootView==="gear"?"active":""} onClick={()=>setLootView("gear")}>Gear & Skills</button><span>{lootView==="cost"?"Cost":lootView==="gear"?"Gear & Skills":"Picked Up"} <b>{lootView==="cost"?live.mapCost.toFixed(1):lootView==="gear"?live.excludedItems.reduce((sum,item)=>sum+item.totalValue,0).toFixed(1):mapNetValue(live.mapValue,live.mapFeDropped).toFixed(1)} FE</b></span></div><div className="lootPanelHead"><button>Overview</button></div><div className="lootCards">{lootView==="picked"&&(pagedMapItems.length?pagedMapItems.map(item=><div className="lootCard" key={item.id}><span className="itemLabel">{item.icon?<Img src={item.icon}/>:<i>✦</i>}<span><b>{item.name}</b><small>{item.quantity} · Total Value <strong>{itemNet(item.configId,item.totalValue).toFixed(1)} FE</strong></small></span></span><span>Unit Price <b>{itemNet(item.configId,item.unitPrice).toFixed(2)} FE</b></span></div>):<div className="empty"><b>Waiting for loot</b><span>Items from {live.currentMap} will appear here.</span></div>)}{lootView==="cost"&&(live.mapCostItems.length?live.mapCostItems.map(item=><div className="lootCard costCard" key={item.configId}><span className="itemLabel">{item.icon?<Img src={item.icon}/>:<i>−</i>}<span><b>{item.name}</b><small>−{item.quantity} · Total Value <strong>−{item.totalValue.toFixed(1)} FE</strong></small></span></span><span>Unit Price <b>{item.unitPrice.toFixed(2)} FE</b></span></div>):<div className="empty"><b>No map costs detected</b><span>Consumed compasses and map materials will appear when you enter a map.</span></div>)}{lootView==="gear"&&(live.excludedItems.length?live.excludedItems.map(item=><div className="lootCard gearCard" key={item.id}><span className="itemLabel">{item.icon?<Img src={item.icon}/>:<i>✦</i>}<span><b>{item.name}</b><small>{item.quantity} · Not counted toward profit <strong>{item.totalValue?`${item.totalValue.toFixed(1)} FE`:"Unpriced"}</strong></small></span></span><span>Unit Price <b>{item.unitPrice?`${item.unitPrice.toFixed(2)} FE`:"—"}</b></span></div>):<div className="empty"><b>No gear or skills yet</b><span>Equipment and skill drops appear here and never affect your profit.</span></div>)}</div>{lootView==="picked"&&live.mapItems.length>8&&pager(mapPage,mapPages,setMapPage)}</article>
        </section>
      </div>}

      {tab==="items"&&<div className="page itemsPage"><aside className="filters panel"><div className="switch"><button className="active">Backpack</button><button>Session loot</button></div><h3>Price status</h3><button className="filter active">All items <b>{live.items.length}</b></button><button className="filter">Priced <b>{live.items.filter(i=>i.unitPrice>0).length}</b></button><button className="filter">Unknown <b>{live.items.filter(i=>!i.unitPrice).length}</b></button><hr/><h3>About inventory</h3><p>Items appear here after Xcatter sees them change in your game log.</p></aside><section className="inventory panel"><div className="inventoryHead"><div><h2>Backpack items</h2><p>Eight items per page, sorted by total FE value</p></div><div className="summary"><span>{live.items.length} items</span><b>{money(afterTax?netBackpackValue:live.estimatedValue)} FE</b></div></div><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search items or item ID"/></div><div className="itemGrid">{pagedItems.map(item=><article key={item.configId}><div className="itemIcon">{item.icon?<Img src={item.icon}/>:"✦"}<small>{item.quantity}</small></div><div><b>{item.name}</b><span>Total value <strong>{item.totalValue?`${itemNet(item.configId,item.totalValue).toFixed(1)} FE`:"Unpriced"}</strong></span></div><small>Unit {item.unitPrice?`${itemNet(item.configId,item.unitPrice).toFixed(2)} FE`:"—"}</small></article>)}{!shownItems.length&&<div className="empty"><b>No items to show yet</b><span>Connect the log and collect loot, or change your search.</span></div>}</div>{shownItems.length>8&&pager(itemPage,itemPages,setItemPage)}</section></div>}

      {tab==="prices"&&<div className="page"><section className="panel pricePage"><div className="panelHead"><div><h2>Afterlight price library</h2><span>{manualSyncing||priceSync.syncing||cloud.syncing?"Updating local and community prices…":"Automatically syncs community prices"}</span></div><button className="primary priceSyncCta" disabled={manualSyncing||priceSync.syncing||cloud.syncing} onClick={updatePricesNow}><AppIcon name="refresh"/>{manualSyncing||priceSync.syncing||cloud.syncing?"Updating…":"Update prices now"}</button></div><div className="table"><div className="tr th"><span>Item</span><span>Unit price</span><span>Source</span><span>Updated</span><span>Status</span></div>{live.items.sort((a,b)=>b.unitPrice-a.unitPrice).map(item=><div className="tr" key={item.configId}><span><b>{item.name}</b><small>ID {item.configId}</small></span><span>{item.unitPrice?`${item.unitPrice.toFixed(2)} FE`:"—"}</span><span>{item.priceSource||"Not learned"}</span><span>{item.pricedAt?new Date(item.pricedAt).toLocaleString():"—"}</span><span><em className={item.pricedAt?"fresh":"unknown"}>{age(item.pricedAt)}</em></span></div>)}</div></section></div>}

      {tab==="history"&&<div className="page historyPage"><section className="panel historyLog"><div className="historyLogHead"><h2>Map Log <span>{live.mapHistory.length}</span></h2><em><i/>Last 10 completed</em></div><div className="historyColumns"><span>Map / Time</span><span>Picked Up</span><span>Loot Types</span><span>Items</span><span>Duration</span></div>{live.mapHistory.length?live.mapHistory.map(map=><article className={`historyMap ${expandedMap===map.id?"open":""}`} key={map.id}><button className="historySummary" onClick={()=>setExpandedMap(expandedMap===map.id?null:map.id)}><span><b>{map.name}</b><small>{new Date(map.completedAt).toLocaleTimeString()}{map.tier?` · ${map.tier}`:""}</small></span><span>{mapNetValue(map.totalValue,map.feDropped||0).toFixed(1)} FE</span><span>{map.items.length}</span><span>{map.items.reduce((sum,item)=>sum+item.quantity,0)}</span><span><b>{clock(map.durationSeconds).slice(3)}</b><i>{expandedMap===map.id?"⌃":"⌄"}</i></span></button>{expandedMap===map.id&&<div className="historyLoot"><div className="historyLootHead"><span>Loot from {map.name}{map.tier?` · ${map.tier}`:""}</span><span>Total value</span></div>{map.items.length?map.items.map(item=><div key={item.id}><span className="itemLabel">{item.icon?<Img src={item.icon}/>:<i>✦</i>}<span><b>{item.name}</b><small>{item.quantity} × {itemNet(item.configId,item.unitPrice).toFixed(2)} FE</small></span></span><strong>{itemNet(item.configId,item.totalValue).toFixed(1)} FE</strong></div>):<p>No loot recorded for this map.</p>}</div>}</article>):<div className="empty"><b>No completed maps yet</b><span>Your latest ten maps will appear here automatically when you return to the hideout.</span></div>}</section></div>}

    </section>

    {setup&&<div className="modal"><div className="modalCard setup"><button className="close" onClick={()=>setSetup(false)}>×</button><span className="eyebrow">DATA CONNECTIONS</span><h2>Keep Xcatter connected</h2><div className={`setupRow ${logStatus.connected?"ready":""}`}><i>1</i><div><b>Real-time game log</b><p>{logStatus.path||"Auto-locate your enabled UE_game.log file."}</p><div className="buttonRow"><button className="primary" onClick={()=>locate(false)}>{locating?"Searching…":"Auto-locate"}</button><button onClick={()=>locate(true)}>Choose file</button></div></div><em>{logStatus.connected?"Connected":"Setup"}</em></div><div className={`setupRow ${cloud.connected?"ready":""}`}><i>2</i><div><b>Community price cloud</b><p>{cloud.message}</p><label>Worker URL<input value={cloudForm.endpoint} onChange={e=>setCloudForm({...cloudForm,endpoint:e.target.value})}/></label><label>Private sharing key<input type="password" value={cloudForm.sharingKey} onChange={e=>setCloudForm({...cloudForm,sharingKey:e.target.value})} placeholder="Leave blank to keep saved key"/></label><div className="buttonRow"><button className="primary" onClick={saveCloud}>Save & connect</button><button onClick={()=>bridge()?.syncCloud()}>Sync now</button></div></div><em>{cloud.connected?"Connected":"Setup"}</em></div><div className="setupRow"><i>3</i><div><b>Price-file backup</b><p>{shareMessage}</p><div className="buttonRow"><button onClick={importPrices}>Import JSON</button><button onClick={exportPrices}>Export JSON</button></div></div><em>Optional</em></div><div className="guardrail">Xcatter reads only the enabled game log. Cloud sharing sends anonymous item-price samples—never account details, character information, inventory contents, or game controls.</div></div></div>}
    {confirmReset&&<div className="modal"><div className="modalCard confirmResetCard"><button className="close" onClick={()=>setConfirmReset(false)}>×</button><span className="eyebrow">START A NEW SESSION</span><h2>Reset this session?</h2><p>This clears the session timer, session profit, map log, and current map loot. Your completed map history is kept.</p><div className="buttonRow confirmActions"><button onClick={()=>setConfirmReset(false)}>Cancel</button><button className="danger" onClick={resetSession}><AppIcon name="reset"/>Reset session</button></div></div></div>}
  </main>;
}
