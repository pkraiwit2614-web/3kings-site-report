import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutivePlanDateCardsSafe20261001 from '@/components/ExecutivePlanDateCardsSafe20261001'
import ExecutivePresentationCarryoverGuard from '@/components/ExecutivePresentationCarryoverGuard'
import ExecutivePhotoReviewSafe20261001 from '@/components/ExecutivePhotoReviewSafe20261001'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutivePlanDateCardsSafe20261001 />
    <ExecutivePresentationCarryoverGuard />
    <ExecutivePhotoReviewSafe20261001 />
    <ExecutivePhotoLinks />
    <style>{`
      .ep-fallback-note{display:none!important}

      /* Task presentation invariant: latest-task slides never show more than 4 photos.
         This is a CSS-only safety net for stale legacy DOM nodes; React remains owner. */
      .ep-slide:not(.condo-slide) .ep-photo-grid>figure:nth-child(n+5){
        display:none!important;
      }

      /* Keep React-owned photo nodes intact. Cropping is handled by CSS only. */
      .ep-stage .ep-photo-grid figure>img,
      .ep-stage:fullscreen .ep-photo-grid figure>img{
        object-fit:contain!important;
        object-position:center center!important;
        background:#fff!important;
      }

      .ep-stage:not(:fullscreen) .ep-photo-grid figure>img{
        width:100%!important;
        height:235px!important;
      }
      .ep-stage:not(:fullscreen) .ep-photo-grid.count-1 figure>img{
        height:500px!important;
      }
      .ep-stage:fullscreen .ep-photo-grid figure>img{
        width:100%!important;
        height:100%!important;
      }

      /* Fullscreen navigation stays left; fullscreen/exit control stays right. */
      .ep-stage:fullscreen .ep-stage-controls{
        position:absolute!important;
        inset:auto 16px 12px 16px!important;
        display:flex!important;
        flex-direction:row!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:16px!important;
        margin:0!important;
        padding:0!important;
        pointer-events:none!important;
        z-index:60!important;
      }
      .ep-stage:fullscreen .ep-stage-controls>div{
        position:static!important;
        left:auto!important;
        right:auto!important;
        bottom:auto!important;
        flex:0 1 auto!important;
        pointer-events:auto!important;
      }
      .ep-stage:fullscreen .ep-stage-controls>button.button{
        position:static!important;
        left:auto!important;
        right:auto!important;
        bottom:auto!important;
        margin-left:auto!important;
        flex:0 0 auto!important;
        pointer-events:auto!important;
      }

      @media(max-width:950px){
        .ep-stage:not(:fullscreen) .ep-photo-grid figure>img{height:260px!important}
        .ep-stage:not(:fullscreen) .ep-photo-grid.count-1 figure>img{height:360px!important}
      }
      @media(max-width:620px){
        .ep-stage:fullscreen .ep-stage-controls{inset:auto 8px 10px 8px!important;gap:8px!important}
      }
    `}</style>
  </>
}
