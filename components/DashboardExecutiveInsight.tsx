'use client'

type Tone = 'danger' | 'warning' | 'info'

type Props = {
  summary: string
  action?: string
  tone?: Tone
}

// Display-only: consumes already validated dashboard aggregates; no reads/writes/sync.
export default function DashboardExecutiveInsight({summary,action,tone='info'}:Props){
  const accent=tone==='danger'?'#c65d61':tone==='warning'?'#bb8732':'#2b82a8'
  return <div aria-label="Executive Insight" role="note" data-dashboard-insight="true"
    style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px 12px',borderTop:'1px solid var(--line)',background:'var(--surface-2)'}}>
    <span aria-hidden="true" style={{flexShrink:0,width:25,height:25,display:'grid',placeItems:'center',borderRadius:7,background:'var(--surface)',border:'1px solid var(--line)',color:accent,fontSize:13,fontWeight:900}}>↗</span>
    <div style={{minWidth:0,lineHeight:1.6}}>
      <div style={{fontSize:9.5,fontWeight:850,letterSpacing:'.05em',color:'var(--muted)'}}>EXECUTIVE INSIGHT</div>
      <div style={{fontSize:12.5,color:'var(--text)',overflowWrap:'anywhere'}}>
        <strong style={{fontWeight:850,color:accent}}>{summary}</strong>
        {action&&<span style={{marginLeft:8,color:'var(--muted)'}}>{action}</span>}
      </div>
    </div>
  </div>
}
