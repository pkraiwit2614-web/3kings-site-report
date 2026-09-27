import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcherV2 from '@/components/ExecutiveAIVisualMatcherV2'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveAIVisualMatcherV2 />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
