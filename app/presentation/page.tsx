import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcher from '@/components/ExecutiveAIVisualMatcher'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveAIVisualMatcher />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
