import ExecutivePresentationV40 from '@/components/ExecutivePresentationV40'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveSmartPhotoFallback from '@/components/ExecutiveSmartPhotoFallback'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV40 />
    <ExecutiveSmartPhotoFallback />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
