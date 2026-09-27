import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcher from '@/components/ExecutiveAIVisualMatcher'
import ExecutiveFallbackRotationGuard from '@/components/ExecutiveFallbackRotationGuard'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveAIVisualMatcher />
    <ExecutiveFallbackRotationGuard />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
