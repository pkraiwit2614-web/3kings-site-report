import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutivePresentationPhotoDisplay from '@/components/ExecutivePresentationPhotoDisplay'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'
import ExecutiveTaskDateCards from '@/components/ExecutiveTaskDateCards'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutiveTaskDateCards />
    <ExecutivePresentationPhotoDisplay />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
  </>
}
