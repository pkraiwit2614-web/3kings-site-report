'use client'

export default function HeaderActionPattern20260927(){
  return <style jsx global>{`
    .ui-request-vertical{
      display:grid!important;
      grid-template-columns:auto 148px!important;
      grid-auto-rows:38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
      min-width:0!important;
    }
    .ui-request-vertical>.ui-polish-update-meta{
      grid-column:1!important;
      grid-row:1!important;
      align-items:flex-end!important;
      margin:0!important;
      width:auto!important;
    }
    .ui-request-vertical>:nth-child(2){grid-column:2!important;grid-row:1!important}
    .ui-request-vertical>:nth-child(3){grid-column:2!important;grid-row:2!important}
    .ui-request-vertical>.button{
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      box-sizing:border-box!important;
      white-space:nowrap!important;
    }

    body.ui-executive-page .ui-request-exec-ready{
      display:grid!important;
      grid-template-columns:auto 168px!important;
      grid-auto-rows:38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
      max-width:none!important;
    }
    body.ui-executive-page .ui-request-exec-ready>.ui-polish-update-meta{
      grid-column:1!important;
      grid-row:1!important;
      align-items:flex-end!important;
      margin:0!important;
      width:auto!important;
    }
    body.ui-executive-page .ui-request-exec-ready>:nth-child(2){grid-column:2!important;grid-row:1!important}
    body.ui-executive-page .ui-request-exec-ready>:nth-child(3){grid-column:2!important;grid-row:2!important}
    body.ui-executive-page .ui-request-exec-ready>.button{
      width:168px!important;
      min-width:168px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      box-sizing:border-box!important;
      white-space:nowrap!important;
    }

    @media(max-width:900px){
      .ui-request-vertical,
      body.ui-executive-page .ui-request-exec-ready{
        justify-content:end!important;
        width:auto!important;
        max-width:100%!important;
      }
      .ui-request-vertical>.ui-polish-update-meta,
      body.ui-executive-page .ui-request-exec-ready>.ui-polish-update-meta{
        align-items:flex-end!important;
      }
    }

    @media(max-width:340px){
      .ui-request-vertical,
      body.ui-executive-page .ui-request-exec-ready{
        grid-template-columns:1fr!important;
        grid-auto-rows:auto!important;
        justify-content:stretch!important;
        width:100%!important;
      }
      .ui-request-vertical>.ui-polish-update-meta,
      body.ui-executive-page .ui-request-exec-ready>.ui-polish-update-meta,
      .ui-request-vertical>:nth-child(2),
      .ui-request-vertical>:nth-child(3),
      body.ui-executive-page .ui-request-exec-ready>:nth-child(2),
      body.ui-executive-page .ui-request-exec-ready>:nth-child(3){
        grid-column:1!important;
        grid-row:auto!important;
      }
      .ui-request-vertical>.ui-polish-update-meta,
      body.ui-executive-page .ui-request-exec-ready>.ui-polish-update-meta{
        align-items:flex-start!important;
      }
    }
  `}</style>
}
