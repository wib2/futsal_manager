import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { 
  Trophy, Users, Calendar, BarChart3, ChevronDown, Plus, 
  Trash2, Shield, Shirt, Activity, ListOrdered
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer
} from "recharts";

const API_URL = "http://localhost:4000/api";

type TeamId = "A" | "B" | "C" | "D";
type Position = "필드" | "GK";

// [변경] 불필요한 필드 삭제 (formation 등)
interface Player { id: string; name: string; pos: Position; active: boolean; }
interface Match { id: string; seq: number; home: TeamId; away: TeamId; hg: number; ag: number; }
interface MatchStats { [pid: string]: { goals: number; assists: number; } }

// [변경] Notes, Formation 삭제됨
interface Session {
  rosters: Record<TeamId, string[]>;
  matches: Match[];
  matchStats: Record<string, MatchStats>;
  defAwards: Record<TeamId, string | null>;
  teamNames: Record<TeamId, string>;
  hasTeamD: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const ensureSunday = (d: string) => { const dt=new Date(d); if(isNaN(dt.getTime())) return new Date().toISOString().split('T')[0]; return dt.toISOString().split('T')[0]; };

// [변경] 초기값에서 삭제된 필드 제거
const emptySession = (): Session => ({
  rosters: { A:[], B:[], C:[], D:[] }, matches: [], matchStats: {}, defAwards: { A:null, B:null, C:null, D:null },
  teamNames: { A:"골든 팀", B:"실버 팀", C:"브론즈 팀", D:"D팀" }, hasTeamD: false
});

const renderScoreOptions = () => Array.from({length: 10}, (_, i) => <option key={i} value={i}>{i}</option>);

export default function App() {
  const [tab, setTab] = useState<"squad"|"match"|"daily"|"total"|"analysis"|"player">("squad");
  const [date, setDate] = useState(ensureSunday(new Date().toISOString()));
  const [players, setPlayers] = useState<Player[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const saveTimer = useRef<any>(null);

  // --- 데이터 로딩 ---
  useEffect(() => {
    Promise.all([axios.get(`${API_URL}/players`), axios.get(`${API_URL}/sessions`)]).then(([p, s]) => {
      setPlayers(p.data);
      if(s.data && Object.keys(s.data).length>0) setSessions(s.data);
      else setSessions({[date]: emptySession()});
    });
  }, []);

  const cur = useMemo(() => sessions[date] || emptySession(), [sessions, date]);
  const updateSession = (patch: Partial<Session>) => {
    setSessions(prev => ({ ...prev, [date]: { ...(prev[date]||emptySession()), ...patch } }));
  };

  // --- 자동 저장 ---
  useEffect(() => {
    if(!sessions[date]) return;
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      axios.post(`${API_URL}/sessions`, { sessionDate: date, sessionData: sessions[date] }).then(()=>console.log("Saved"));
    }, 1500);
  }, [sessions, date]);

  // --- [핵심] 통계 계산 로직 (클린시트 자동화 포함) ---
  function calcScores(session: Session) {
    const out: Record<string, any> = {};
    const standings:any = {A:{pts:0},B:{pts:0},C:{pts:0},D:{pts:0}};
    
    // 승점 계산
    session.matches.forEach(m=>{
       const hg=m.hg||0, ag=m.ag||0;
       if(hg>ag){standings[m.home].pts+=3;} else if(hg<ag){standings[m.away].pts+=3;} else{standings[m.home].pts+=1;standings[m.away].pts+=1;}
    });
    
    const rankedTeams = Object.keys(standings).filter(t=>session.hasTeamD?true:t!=='D').sort((a,b)=>standings[b].pts-standings[a].pts);
    const teamBonus = session.hasTeamD?[4,3,2,1]:[4,2,1,0];
    const teamPointsMap:Record<string,number>={};
    rankedTeams.forEach((t,i)=>teamPointsMap[t]=teamBonus[i]||0);

    // [Helper] 해당 팀의 GK 포지션 선수들 찾기
    const findGKs = (tid: TeamId) => {
        const teamMembers = session.rosters[tid] || [];
        return teamMembers.filter(pid => players.find(p => p.id === pid)?.pos === "GK");
    };

    session.matches.forEach(m=>{
       // 골/어시스트 집계
       const ms = session.matchStats[m.id]||{};
       Object.entries(ms).forEach(([pid,v])=>{
          if(!out[pid]) out[pid]={g:0,a:0,cs:0,def:0,team:0,days:0};
          out[pid].g+=v.goals; out[pid].a+=v.assists;
       });

       // [자동 계산] 클린시트 집계
       // 원정팀 0점 -> 홈팀 GK들 CS 추가
       if(m.ag === 0) {
           findGKs(m.home).forEach(gkId => {
               if(!out[gkId]) out[gkId]={g:0,a:0,cs:0,def:0,team:0,days:0};
               out[gkId].cs++;
           });
       }
       // 홈팀 0점 -> 원정팀 GK들 CS 추가
       if(m.hg === 0) {
           findGKs(m.away).forEach(gkId => {
               if(!out[gkId]) out[gkId]={g:0,a:0,cs:0,def:0,team:0,days:0};
               out[gkId].cs++;
           });
       }
    });

    // 기본 점수 및 수비왕 점수
    (["A","B","C","D"] as TeamId[]).forEach(tid=>{
       (session.rosters[tid]||[]).forEach(pid=>{
          if(!out[pid]) out[pid]={g:0,a:0,cs:0,def:0,team:0,days:0};
          out[pid].team = teamPointsMap[tid];
          out[pid].days = 1;
          if(session.defAwards[tid]===pid) out[pid].def=2;
       });
    });

    Object.keys(out).forEach(pid=>{
       out[pid].total = out[pid].g + out[pid].a + out[pid].cs + out[pid].def + out[pid].team;
       out[pid].name = players.find(p=>p.id===pid)?.name || "-";
    });
    return out;
  }

  const dailyStats = useMemo(() => {
    const scores = calcScores(cur);
    return Object.entries(scores).map(([id, v]: any) => ({ id, ...v })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [cur, players]);

  const cumulativeStats = useMemo(() => {
    const agg: Record<string, any> = {};
    Object.values(sessions).forEach(s => {
       const sc = calcScores(s);
       Object.entries(sc).forEach(([pid, v]:any)=>{
          if(!agg[pid]) agg[pid]={g:0,a:0,cs:0,def:0,team:0,total:0,days:0,name:players.find(p=>p.id===pid)?.name};
          agg[pid].g+=v.g; agg[pid].a+=v.a; agg[pid].cs+=v.cs; agg[pid].def+=v.def;
          agg[pid].team+=v.team; agg[pid].total+=v.total; agg[pid].days+=v.days;
       });
    });
    return Object.entries(agg).map(([id,v]:any)=>({id, ...v, avg:(v.days>0?v.total/v.days:0).toFixed(1)})).sort((a,b)=>b.total-a.total);
  }, [sessions, players]);

  const top5 = (key:string) => [...cumulativeStats].sort((a:any,b:any)=>b[key]-a[key]).slice(0,5);
  const selectedPlayerData = selectedPlayerId ? cumulativeStats.find(p => p.id === selectedPlayerId) : null;

  // --- 핸들러 ---
  const handleAddPlayer = async (name: string) => {
    if (!name.trim()) return;
    try {
      const res = await axios.post(`${API_URL}/players`, { name, pos: "필드", active: true });
      setPlayers(prev => [...prev, res.data]);
    } catch (error) {
      alert("선수 추가 실패 (서버 로그 확인)");
    }
  };
  
  const handleUpdatePlayer = (id:string, patch:Partial<Player>) => {
    setPlayers(ps => ps.map(p => p.id===id?{...p,...patch}:p));
    axios.put(`${API_URL}/players/${id}`, patch);
  };
  
  const handleDeletePlayer = (id:string) => {
    if(confirm("삭제하시겠습니까? 기록도 함께 사라집니다.")) {
      axios.delete(`${API_URL}/players/${id}`).then(() => setPlayers(players.filter(p=>p.id!==id)));
    }
  };

  return (
    <div className="app">
      <header>
        <div className="logo"><Trophy color="#D4AF37"/> FUTSAL MANAGER</div>
        <div className="header-controls">
          <div className="date-ctrl">
            <label>📅 날짜:</label>
            <input type="date" value={date} onChange={e=>setDate(ensureSunday(e.target.value))} />
          </div>
        </div>
      </header>
      
      <nav className="tabs">
        <button className={tab==="squad"?"active":""} onClick={()=>setTab("squad")}><Shirt size={16}/> 스쿼드</button>
        <button className={tab==="match"?"active":""} onClick={()=>setTab("match")}><Calendar size={16}/> 경기 기록</button>
        <button className={tab==="daily"?"active":""} onClick={()=>setTab("daily")}><ListOrdered size={16}/> 일자별 순위</button>
        <button className={tab==="total"?"active":""} onClick={()=>setTab("total")}><BarChart3 size={16}/> 전체 순위</button>
        <button className={tab==="analysis"?"active":""} onClick={()=>setTab("analysis")}><Activity size={16}/> 분석</button>
        <button className={tab==="player"?"active":""} onClick={()=>setTab("player")}><Users size={16}/> 선수 관리</button>
      </nav>

      <main>
        {/* 1. 스쿼드 편성 (Formation 삭제됨) */}
        {tab === "squad" && (
          <div className="fade-in">
            <div className="card-header">
              <h3>{date} 스쿼드 편성</h3>
              {!cur.hasTeamD && <button className="btn-outline" onClick={()=>updateSession({hasTeamD:true})}>+ D팀 추가</button>}
            </div>
            <div className="squad-grid">
              {(cur.hasTeamD?["A","B","C","D"]:["A","B","C"]).map(tid => (
                <div key={tid} className={`squad-col team-${tid}`}>
                  <div className="squad-head">
                    <input className="team-name-input" value={cur.teamNames[tid as TeamId]} onChange={e=>updateSession({teamNames:{...cur.teamNames, [tid]:e.target.value} as any})} placeholder="팀명"/>
                  </div>
                  <div className="roster-check">
                    {players.filter(p=>p.active).map(p => {
                      const isMember = (cur.rosters[tid as TeamId]||[]).includes(p.id);
                      return (
                        <div key={p.id} className={`roster-item ${isMember?"on":""}`} onClick={()=>{
                          const list = cur.rosters[tid as TeamId]||[];
                          const next = isMember ? list.filter(id=>id!==p.id) : [...list, p.id];
                          updateSession({rosters:{...cur.rosters, [tid]:next}});
                        }}>
                          <div className="chk">{isMember?"✔":""}</div><span>{p.name}</span>{p.pos==="GK" && <span className="badge gk">GK</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mvp-sel">
                    <Shield size={14}/>
                    <select value={cur.defAwards[tid as TeamId]||""} onChange={e=>updateSession({defAwards:{...cur.defAwards, [tid]:e.target.value||null}})}>
                      <option value="">수비왕 선택</option>{(cur.rosters[tid as TeamId]||[]).map(pid=><option key={pid} value={pid}>{players.find(p=>p.id===pid)?.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. 경기 기록 (GK 선택 삭제됨 - 아주 심플!) */}
        {tab === "match" && (
          <div className="fade-in">
             <div className="card-header"><h3>{date} 경기 결과</h3><button className="btn-primary" onClick={()=>{const maxS=Math.max(0,...cur.matches.map(m=>m.seq)); updateSession({matches:[...cur.matches, {id:uid(), seq:maxS+1, home:"A", away:"B", hg:0, ag:0}]});}}><Plus size={16}/> 경기 추가</button></div>
             <div className="match-list">
               {cur.matches.sort((a,b)=>a.seq-b.seq).map(m => (
                 <div key={m.id} className="match-card">
                   <div className="match-top">
                     <span className="badge">{m.seq}경기</span>
                     <div className="scores">
                       <select value={m.home} onChange={e=>updateSession({matches:cur.matches.map(x=>x.id===m.id?{...x,home:e.target.value as any}:x)})}>{(cur.hasTeamD?["A","B","C","D"]:["A","B","C"]).map(t=><option key={t} value={t}>{cur.teamNames[t as TeamId]}</option>)}</select>
                       <select className="score-select" value={m.hg} onChange={e=>updateSession({matches:cur.matches.map(x=>x.id===m.id?{...x,hg:+e.target.value}:x)})}>{renderScoreOptions()}</select>
                       <span>:</span>
                       <select className="score-select" value={m.ag} onChange={e=>updateSession({matches:cur.matches.map(x=>x.id===m.id?{...x,ag:+e.target.value}:x)})}>{renderScoreOptions()}</select>
                       <select value={m.away} onChange={e=>updateSession({matches:cur.matches.map(x=>x.id===m.id?{...x,away:e.target.value as any}:x)})}>{(cur.hasTeamD?["A","B","C","D"]:["A","B","C"]).map(t=><option key={t} value={t}>{cur.teamNames[t as TeamId]}</option>)}</select>
                     </div>
                     <button className="icon-btn danger" onClick={()=>updateSession({matches:cur.matches.filter(x=>x.id!==m.id)})}> <Trash2 size={16}/> </button>
                   </div>
                   
                   <div className="match-detail">
                     <details>
                       <summary>기록 입력 (골/어시) <ChevronDown size={14}/></summary>
                       <div className="stat-cols">
                         {[m.home, m.away].map(tid => (
                           <div key={tid} className="stat-col">
                             <h4>{cur.teamNames[tid as TeamId]}</h4>
                             {(cur.rosters[tid as TeamId]||[]).map(pid => {
                               const st = cur.matchStats[m.id]?.[pid] || {goals:0, assists:0};
                               return (
                                 <div key={pid} className="stat-row">
                                   <span>{players.find(p=>p.id===pid)?.name}</span>
                                   <div>
                                     G <select className="stat-select" value={st.goals} onChange={e=>{const ms={...cur.matchStats}; if(!ms[m.id]) ms[m.id]={}; ms[m.id][pid]={...st, goals:+e.target.value}; updateSession({matchStats:ms})}}>{renderScoreOptions()}</select>
                                     A <select className="stat-select" value={st.assists} onChange={e=>{const ms={...cur.matchStats}; if(!ms[m.id]) ms[m.id]={}; ms[m.id][pid]={...st, assists:+e.target.value}; updateSession({matchStats:ms})}}>{renderScoreOptions()}</select>
                                   </div>
                                 </div>
                               )
                             })}
                           </div>
                         ))}
                       </div>
                     </details>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* 3. 일자별 순위 */}
        {tab === "daily" && (
          <div className="fade-in">
            <div className="card-header"><h3>{date} 오늘의 순위</h3></div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>순위</th><th>이름</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th></tr></thead>
                <tbody>
                  {dailyStats.map((p:any, i) => (
                    <tr key={p.id} className={i<3?`top-rank-${i+1}`:''}>
                      <td>{i+1}</td><td>{p.name}</td><td>{p.g}</td><td>{p.a}</td><td>{p.cs}</td><td>{p.def}</td><td>{p.team}</td><td className="score">{p.total}</td>
                    </tr>
                  ))}
                  {dailyStats.length === 0 && <tr><td colSpan={8} style={{padding:20, color:'#666'}}>기록된 데이터가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. 전체 순위 */}
        {tab === "total" && (
          <div className="fade-in">
            <div className="card-header"><h3>누적 전체 순위</h3></div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>순위</th><th>이름</th><th>참여</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th><th>평균</th></tr></thead>
                <tbody>
                  {cumulativeStats.map((p:any, i) => (
                    <tr key={p.id} className={i<3?`top-rank-${i+1}`:''}>
                      <td>{i+1}</td><td>{p.name}</td><td>{p.days}</td><td>{p.g}</td><td>{p.a}</td><td>{p.cs}</td><td>{p.def}</td><td>{p.team}</td><td className="score">{p.total}</td><td>{p.avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. 분석 */}
        {tab === "analysis" && (
          <div className="fade-in">
            <div className="card-header"><h3>선수 분석 및 랭킹</h3></div>
            <div className="analysis-row">
              <div className="chart-card">
                <h4>선수 상세 분석</h4>
                <select value={selectedPlayerId||""} onChange={e=>setSelectedPlayerId(e.target.value)} style={{width:'100%',marginBottom:10}}>
                  <option value="">선수 선택</option>
                  {players.filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {selectedPlayerData ? (
                  <div style={{height:250}}>
                    <ResponsiveContainer>
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                        {s:'득점', v:selectedPlayerData.g}, {s:'도움', v:selectedPlayerData.a}, {s:'수비', v:selectedPlayerData.def},
                        {s:'클린', v:selectedPlayerData.cs}, {s:'팀점수', v:selectedPlayerData.team}
                      ]}>
                        <PolarGrid stroke="#444"/><PolarAngleAxis dataKey="s" stroke="#ccc"/><PolarRadiusAxis domain={[0,10]} angle={30} stroke="#555"/>
                        <Radar name={selectedPlayerData.name} dataKey="v" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.5}/>
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p style={{color:'#666',textAlign:'center',padding:40}}>선수를 선택하세요</p>}
              </div>
              
              <div className="chart-card">
                <h4>🏆 명예의 전당 (TOP 3)</h4>
                <div className="rank-grid-mini">
                  {[{k:'total',t:'총점왕'},{k:'g',t:'득점왕'},{k:'a',t:'도움왕'},{k:'def',t:'수비왕'}].map(cat => (
                    <div key={cat.k} className="rank-box">
                      <h5>{cat.t}</h5>
                      {top5(cat.k).slice(0,3).map((p:any,i)=>(
                        <div key={p.id} className="rank-row-mini">
                          <span className={`rank-num r-${i+1}`}>{i+1}</span> <span>{p.name}</span> <span className="val">{p[cat.k]}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. 선수 관리 */}
        {tab === "player" && (
          <div className="fade-in">
            <div className="card-header"><h3>선수 목록 관리</h3></div>
            <div className="add-row">
              <input id="np" placeholder="이름 입력" onKeyDown={e=>{if(!e.nativeEvent.isComposing&&e.key==="Enter"){handleAddPlayer(e.currentTarget.value);e.currentTarget.value=""}}}/> 
              <button className="btn-primary" onClick={()=>{const el=document.getElementById("np") as HTMLInputElement; handleAddPlayer(el.value); el.value=""}}>추가</button>
            </div>
            <div className="p-grid">
               {players.sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
                 <div key={p.id} className={`p-card ${!p.active?"off":""}`}>
                   <span>{p.name} <small>{p.pos}</small></span>
                   <div>
                     <button onClick={()=>handleUpdatePlayer(p.id,{pos:p.pos==="GK"?"필드":"GK"})}>포지션</button>
                     <button onClick={()=>handleUpdatePlayer(p.id,{active:!p.active})}>{p.active?"활성":"비활성"}</button>
                     <button className="del" onClick={()=>handleDeletePlayer(p.id)}><Trash2 size={14}/></button>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        :root { --bg:#121212; --card:#1e1e1e; --border:#333; --gold:#D4AF37; --text:#e0e0e0; --team-a:#ff6b6b; --team-b:#feca57; --team-c:#f8f9fa; --team-d:#48dbfb; }
        * { box-sizing:border-box; }
        body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui; }
        .app { max-width:1100px; margin:0 auto; padding-bottom:50px; }
        header { display:flex; justify-content:space-between; padding:20px; border-bottom:1px solid var(--border); align-items:center; }
        .logo { font-weight:800; color:var(--gold); display:flex; gap:10px; align-items:center; font-size:1.2rem; }
        
        .header-controls { display:flex; gap:10px; align-items:center; }
        .date-ctrl { display:flex; align-items:center; gap:10px; background:var(--card); padding:8px 12px; border-radius:8px; border:1px solid var(--border); }
        .btn-header { background:var(--gold); color:#000; padding:8px 12px; }

        .tabs { display:flex; gap:10px; padding:20px 20px 0; overflow-x:auto; }
        .tabs button { background:transparent; border:none; color:#888; padding:10px 15px; cursor:pointer; display:flex; gap:6px; font-weight:bold; border-radius:8px 8px 0 0; white-space:nowrap; }
        .tabs button.active { background:var(--card); color:var(--gold); border:1px solid var(--border); border-bottom:none; }
        main { background:var(--card); margin:0 20px; padding:20px; border:1px solid var(--border); border-radius:0 8px 8px 8px; min-height:500px; }
        
        input, select { background:#2a2a2a; border:1px solid #444; color:#fff; padding:6px; border-radius:4px; }
        button { cursor:pointer; border-radius:4px; border:none; padding:6px 12px; font-weight:bold; display:flex; align-items:center; gap:4px; }
        .btn-primary { background:var(--gold); color:#000; }
        .btn-outline { background:transparent; border:1px solid var(--gold); color:var(--gold); }
        .icon-btn { padding:6px; background:transparent; }
        .icon-btn.danger { color:#ff4d4d; }
        
        .squad-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:15px; }
        .squad-col { background:#252525; border-radius:8px; padding:10px; border-top:3px solid #555; }
        .team-A { border-color:var(--team-a); } .team-B { border-color:var(--team-b); } .team-C { border-color:var(--team-c); } .team-D { border-color:var(--team-d); }
        .squad-head { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
        .team-name-input { width: 100%; font-weight: bold; border: 1px solid #555; } 
        .roster-check { max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
        .roster-item { display:flex; align-items:center; gap:8px; padding:6px; border-radius:4px; cursor:pointer; font-size:14px; }
        .roster-item:hover { background:#333; }
        .roster-item.on { background:rgba(212,175,55,0.15); color:var(--gold); font-weight:bold; }
        .chk { width:14px; font-size:10px; text-align:center; }
        .badge { font-size:10px; padding:2px 4px; border-radius:3px; background:#444; color:#ccc; }
        .badge.gk { background:#6c5ce7; color:#fff; }
        
        .match-list { display:flex; flex-direction:column; gap:10px; margin-top:15px; }
        .match-card { background:#252525; border:1px solid #333; border-radius:8px; }
        .match-top { display:flex; justify-content:space-between; align-items:center; padding:10px; background:#2a2a2a; }
        .scores { display:flex; align-items:center; gap:5px; }
        .score-select { width:50px; text-align:center; font-weight:bold; font-size:16px; }
        .match-detail { padding:10px; }
        .stat-cols { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:10px; padding-top:10px; border-top:1px solid #333; }
        .stat-row { display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; }
        .stat-select { width:40px; padding:2px; text-align:center; margin-left:2px; font-size:12px; }
        
        .p-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px; margin-top:15px; }
        .p-card { background:#252525; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; }
        .p-card.off { opacity:0.5; }
        .p-card div { display:flex; gap:5px; }
        .p-card .del { background:rgba(255,0,0,0.1); color:#ff4d4d; }
        
        .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; }
        h3 { margin:0; color:var(--gold); }
        .fade-in { animation: fadeIn 0.3s; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }

        .table-wrapper { overflow-x:auto; }
        .data-table { width:100%; border-collapse:collapse; text-align:center; font-size:14px; }
        .data-table th { background:#333; padding:8px; color:#aaa; }
        .data-table td { border-bottom:1px solid #333; padding:8px; }
        .data-table .score { color:var(--gold); font-weight:bold; }
        .top-rank-1 td { color:#ffd700; }
        .top-rank-2 td { color:#c0c0c0; }
        .top-rank-3 td { color:#cd7f32; }

        .analysis-row { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .chart-card { background:#252525; padding:15px; border-radius:8px; border:1px solid #333; }
        .rank-grid-mini { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .rank-box { background:#2a2a2a; padding:10px; border-radius:6px; }
        .rank-box h5 { margin:0 0 8px 0; color:#aaa; font-size:12px; }
        .rank-row-mini { display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px; }
        .rank-num { font-weight:bold; width:15px; }
        .r-1 { color:#ffd700; } .r-2 { color:#c0c0c0; } .r-3 { color:#cd7f32; }
        .val { color:var(--gold); font-weight:bold; }
        
        .add-row { display:flex; gap:10px; margin-bottom:20px; }
        .add-row input { flex:1; }
        
        @media (max-width:768px) {
          .squad-grid { grid-template-columns:1fr 1fr; }
          .analysis-row { grid-template-columns:1fr; }
        }
      `}</style>
    </div>
  );
}