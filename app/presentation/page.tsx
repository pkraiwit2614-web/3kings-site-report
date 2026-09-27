import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcherV2 from '@/components/ExecutiveAIVisualMatcherV2'
import ExecutivePresentationPhotoDisplay from '@/components/ExecutivePresentationPhotoDisplay'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'
import ExecutiveTaskDateCards from '@/components/ExecutiveTaskDateCards'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveTaskDateCards />
    <ExecutiveAIVisualMatcherV2 />
    <ExecutivePresentationPhotoDisplay />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
    <style>{`
      .ep-fallback-note{display:none!important}
      .ep-stage .ep-photo-grid img,
      .ep-stage:fullscreen .ep-photo-grid img,
      .ep-stage .ep-photo-grid.count-1 img{
        object-fit:contain!important;
        object-position:center center!important;
      }
      .ep-stage[data-photo-fit="white"] .ep-photo-grid img{background:#fff!important}
      .ep-stage[data-photo-fit="blur"] .ep-photo-grid img{background:transparent!important}
      .ep-stage:fullscreen .ep-photo-media{height:100%!important;min-height:0!important}
    `}</style>
  </>
}
