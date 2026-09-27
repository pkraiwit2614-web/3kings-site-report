import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveSmartPhotoFallback from '@/components/ExecutiveSmartPhotoFallback'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveSmartPhotoFallback />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
