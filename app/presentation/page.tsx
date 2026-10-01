import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcherV2 from '@/components/ExecutiveAIVisualMatcherV2'
import ExecutivePresentationPhotoDisplay from '@/components/ExecutivePresentationPhotoDisplay'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'
import ExecutiveTaskTruthOverlay20261001 from '@/components/ExecutiveTaskTruthOverlay20261001'
import ExecutivePresentationCarryoverGuard from '@/components/ExecutivePresentationCarryoverGuard'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveTaskTruthOverlay20261001 />
    <ExecutivePresentationCarryoverGuard />
    <ExecutiveAIVisualMatcherV2 />
    <ExecutivePresentationPhotoDisplay />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
    <style>{`
      .ep-fallback-note{display:none!important}

      /* Presentation evidence must always show the complete source photo. */
      .ep-stage .ep-photo-grid figure>img,
      .ep-stage .ep-photo-grid .ep-photo-media>img,
      .ep-stage:fullscreen .ep-photo-grid figure>img,
      .ep-stage:fullscreen .ep-photo-grid .ep-photo-media>img{
        object-fit:contain!important;
        object-position:center center!important;
      }

      .ep-stage .ep-photo-media{
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        overflow:hidden!important;
      }
      .ep-stage .ep-photo-media>img{
        width:auto!important;
        height:auto!important;
        max-width:100%!important;
        max-height:100%!important;
      }

      .ep-stage:not(:fullscreen) .ep-photo-grid figure>img{
        width:100%!important;
        height:235px!important;
      }
      .ep-stage:not(:fullscreen) .ep-photo-grid.count-1 figure>img{
        height:500px!important;
      }

      .ep-stage[data-photo-fit="white"] .ep-photo-grid figure,
      .ep-stage[data-photo-fit="white"] .ep-photo-media,
      .ep-stage:not([data-photo-fit]) .ep-photo-grid figure{
        background:#fff!important;
      }
      .ep-stage[data-photo-fit="white"] .ep-photo-grid img{background:#fff!important}
      .ep-stage[data-photo-fit="blur"] .ep-photo-grid img{background:transparent!important}

      .ep-stage:fullscreen .ep-photo-media{
        height:100%!important;
        min-height:0!important;
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
