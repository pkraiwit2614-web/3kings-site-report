import ExecutivePresentationV41 from '@/components/ExecutivePresentationV41'
import ExecutivePhotoLinks from '@/components/ExecutivePhotoLinks'
import ExecutiveAIVisualMatcherV2 from '@/components/ExecutiveAIVisualMatcherV2'
import ExecutivePresentationPhotoDisplay from '@/components/ExecutivePresentationPhotoDisplay'
import PresentationCondoEnhancer from '@/components/PresentationCondoEnhancer'
import ExecutivePlanDateFields20260930 from '@/components/ExecutivePlanDateFields20260930'
import ExecutivePresentationCarryoverGuard from '@/components/ExecutivePresentationCarryoverGuard'

export default function ExecutivePresentationPage(){
  return <>
    <ExecutivePresentationV41 />
    <ExecutivePlanDateFields20260930 />
    <ExecutivePresentationCarryoverGuard />
    <ExecutiveAIVisualMatcherV2 />
    <ExecutivePresentationPhotoDisplay />
    <PresentationCondoEnhancer />
    <ExecutivePhotoLinks />
    <style>{`
      .ep-fallback-note{display:none!important}

      /* Guaranteed visible Plan Start / Plan Finish row on the active task slide. */
      .ep-native-plan-dates{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        gap:8px!important;
        width:100%!important;
      }
      .ep-native-plan-dates>div{
        min-width:0!important;
        min-height:64px!important;
        padding:10px 12px!important;
        box-sizing:border-box!important;
        border:1px solid #e5cc8e!important;
        border-left:4px solid #b8872e!important;
        border-radius:10px!important;
        background:#fff8e8!important;
        display:grid!important;
        align-content:center!important;
      }
      .ep-native-plan-dates span{
        display:block!important;
        font-size:10px!important;
        font-weight:900!important;
        color:#746d61!important;
      }
      .ep-native-plan-dates b{
        display:block!important;
        margin-top:4px!important;
        font-size:16px!important;
        line-height:1.2!important;
        color:#17243a!important;
        white-space:normal!important;
      }

      /* Hide older pseudo-card attempt once the guaranteed row is mounted. */
      .ep-task-info:has(.ep-native-plan-dates)::before,
      .ep-task-info:has(.ep-native-plan-dates)::after{display:none!important;content:none!important}

      /* Presentation evidence must always show the complete source photo. */
      .ep-stage .ep-photo-grid figure>img,
      .ep-stage .ep-photo-grid .ep-photo-media>img,
      .ep-stage:fullscreen .ep-photo-grid figure>img,
      .ep-stage:fullscreen .ep-photo-grid .ep-photo-media>img{
        object-fit:contain!important;
        object-position:center center!important;
      }

      /* Once the photo wrapper is mounted, fit by intrinsic aspect ratio as an
         additional guard against any legacy cover/height rules. */
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

      /* Before the wrapper mounts, keep the original task image uncropped too. */
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
        .ep-native-plan-dates>div{min-height:58px!important;padding:9px 10px!important}
        .ep-native-plan-dates b{font-size:14px!important}
        .ep-stage:fullscreen .ep-stage-controls{inset:auto 8px 10px 8px!important;gap:8px!important}
      }
    `}</style>
    <script dangerouslySetInnerHTML={{__html:`
      (function(){
        if(window.__epPlanDateGuard)return;
        window.__epPlanDateGuard=true;

        function clean(value){return String(value||'').trim();}

        function readDates(slide,taskInfo){
          var start=clean(taskInfo.getAttribute('data-plan-start'));
          var end=clean(taskInfo.getAttribute('data-plan-end'));
          var p=slide.querySelector('header p');
          var text=p?clean(p.textContent):'';
          var m=text.match(/Plan\\s+(.+?)\\s*(?:→|->|–)\\s*(.+?)\\s*$/i);
          if(!start&&m)start=clean(m[1]);
          if(!end&&m)end=clean(m[2]);
          return {start:start||'—',end:end||'—'};
        }

        function makeCard(label,value,key){
          var box=document.createElement('div');
          box.setAttribute('data-plan-native',key);
          var s=document.createElement('span');
          s.textContent=label;
          var b=document.createElement('b');
          b.textContent=value;
          box.appendChild(s);
          box.appendChild(b);
          return box;
        }

        function apply(){
          var slide=document.querySelector('.ep-stage .ep-slide:not(.condo-slide)');
          if(!slide)return;
          var taskInfo=slide.querySelector('.ep-task-info');
          var progress=taskInfo&&taskInfo.querySelector(':scope > .ep-progress');
          if(!taskInfo||!progress)return;

          var dates=readDates(slide,taskInfo);
          var row=taskInfo.querySelector(':scope > .ep-native-plan-dates');
          if(!row){
            row=document.createElement('div');
            row.className='ep-native-plan-dates';
            row.appendChild(makeCard('เริ่มในแผน',dates.start,'start'));
            row.appendChild(makeCard('จบในแผน',dates.end,'end'));
          }

          var startBox=row.querySelector('[data-plan-native="start"] b');
          var endBox=row.querySelector('[data-plan-native="end"] b');
          if(startBox&&startBox.textContent!==dates.start)startBox.textContent=dates.start;
          if(endBox&&endBox.textContent!==dates.end)endBox.textContent=dates.end;

          if(progress.nextElementSibling!==row){
            progress.insertAdjacentElement('afterend',row);
          }
        }

        var queued=false;
        function schedule(){
          if(queued)return;
          queued=true;
          requestAnimationFrame(function(){queued=false;apply();});
        }

        var observer=new MutationObserver(schedule);
        observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-plan-start','data-plan-end']});
        document.addEventListener('click',schedule,true);
        document.addEventListener('change',schedule,true);
        setInterval(apply,500);
        schedule();
      })();
    `}} />
  </>
}
